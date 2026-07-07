# Phase 0 Foundation — App Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real, working multi-tenant skeleton described as Phase 0 in the design spec: a recruiter/admin can create an organization, create a staff user, log in, and hit an RBAC-protected route — fully backed by a real SQL Server database with enforced row-level tenant isolation, all covered by automated tests. No exam concepts, no cloud infrastructure yet.

**Architecture:** NestJS API + Next.js frontend in an npm-workspaces monorepo, Prisma ORM against SQL Server. Multi-tenant isolation is enforced at two layers per the spec: application-layer scoping and a native SQL Server Row-Level Security policy as the backstop. Tenant context is threaded through every tenant-scoped query via a `TenantPrismaService.forTenant()` helper that sets `SESSION_CONTEXT` inside a Prisma interactive transaction before running any query.

**Tech Stack:** TypeScript, NestJS 10, Next.js 14 (App Router), Prisma 5 (`sqlserver` provider), SQL Server 2022 (Docker for local dev), Argon2id (`argon2` package), JWT (`@nestjs/jwt`, `passport-jwt`), Jest + Supertest.

## Global Constraints

- Node.js 20 LTS, npm workspaces (no other package manager).
- All primary keys are UUIDs (`uuid()` default in Prisma), per spec Database Design section.
- Passwords hashed with Argon2id — never bcrypt/plain hashes.
- JWT access tokens expire in 15 minutes; refresh tokens rotate on every use with reuse detection (per spec Security Design).
- Every tenant-scoped table (`users`, `audit_logs`) is protected by a SQL Server Row-Level Security Security Policy — application code must go through `TenantPrismaService.forTenant()` for these tables, never the raw `PrismaService` client directly.
- Audit logs are insert-only from application code — no update/delete methods are ever written against `audit_logs`.
- No exam/candidate/question concepts in this phase — those start in Phase 1.
- No cloud/Terraform/CI-CD work in this phase — local-only, `npm run dev` must be sufficient to run and test everything.

---

## File Structure

```
/ (repo root)
  package.json                          # npm workspaces root
  tsconfig.base.json
  docker-compose.yml                     # local SQL Server
  .env.example
  apps/
    api/
      package.json
      tsconfig.json
      prisma/
        schema.prisma
        migrations/
          <timestamp>_init_schema/migration.sql
        seed.ts
      src/
        main.ts
        app.module.ts
        prisma/
          prisma.service.ts
          prisma.module.ts
          tenant-context.ts
          tenant-prisma.service.ts
        auth/
          auth.module.ts
          auth.controller.ts
          auth.service.ts
          jwt.strategy.ts
          jwt-auth.guard.ts
          current-tenant.decorator.ts
          dto/login.dto.ts
          dto/refresh.dto.ts
        rbac/
          permissions.decorator.ts
          permissions.guard.ts
        organizations/
          organizations.module.ts
          organizations.controller.ts
          organizations.service.ts
          dto/create-organization.dto.ts
        users/
          users.module.ts
          users.controller.ts
          users.service.ts
          dto/create-user.dto.ts
        audit/
          audit.module.ts
          audit.service.ts
      test/
        tenant-isolation.e2e-spec.ts
        auth-flow.e2e-spec.ts
  apps/
    web/
      package.json
      next.config.js
      tsconfig.json
      app/
        layout.tsx
        login/page.tsx
        dashboard/page.tsx
      lib/
        api-client.ts
        auth-context.tsx
```

---

### Task 1: Monorepo scaffolding & tooling

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Test: `apps/api/test/health.e2e-spec.ts`

**Interfaces:**
- Produces: a running NestJS app on `http://localhost:3001`, workspace commands `npm run dev:api` / `npm run dev:web` from repo root.

- [ ] **Step 1: Create the root workspace files**

`package.json`:
```json
{
  "name": "exam-platform",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev:api": "npm run start:dev --workspace=apps/api",
    "dev:web": "npm run dev --workspace=apps/web",
    "test:api": "npm run test --workspace=apps/api",
    "test:api:e2e": "npm run test:e2e --workspace=apps/api"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "./dist"
  }
}
```

`.gitignore`:
```
node_modules/
dist/
.env
*.log
```

`.env.example`:
```
DATABASE_URL="sqlserver://localhost:1433;database=examapp;user=sa;password=DevPassw0rd!2026;trustServerCertificate=true"
JWT_ACCESS_SECRET="dev-access-secret-change-me"
JWT_REFRESH_SECRET="dev-refresh-secret-change-me"
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
API_PORT=3001
WEB_ORIGIN=http://localhost:3000
```

- [ ] **Step 2: Scaffold the NestJS API app**

`apps/api/package.json`:
```json
{
  "name": "@exam-platform/api",
  "version": "0.0.1",
  "scripts": {
    "start:dev": "nest start --watch",
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@prisma/client": "^5.10.0",
    "argon2": "^0.31.2",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.6",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.11",
    "@types/node": "^20.11.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.10.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  }
}
```

`apps/api/tsconfig.json`:
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

`apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
})
export class AppModule {}
```

`apps/api/src/main.ts`:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: process.env.WEB_ORIGIN, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.API_PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 2b: Write a health-check e2e test**

`apps/api/test/jest-e2e.json`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

`apps/api/test/health.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots the app module', () => {
    expect(app).toBeDefined();
  });
});
```

- [ ] **Step 3: Install dependencies and run the test**

Run: `npm install` (from repo root), then `npm run test:api:e2e`
Expected: `1 passed` — the app module compiles and initializes cleanly.

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json .gitignore .env.example apps/api
git commit -m "chore: scaffold monorepo and NestJS API skeleton"
```

---

### Task 2: Local SQL Server instance

**Deviation from original plan:** this task originally specified a Dockerized SQL Server via `docker-compose.yml`. Docker Desktop's daemon would not start cleanly on the development machine and troubleshooting it was deprioritized in favor of unblocking the rest of Phase 0. Instead, this task was fulfilled using the SQL Server 2019 Express instance already installed on the machine (`localhost\SQLEXPRESS`), configured for TCP access. **This was done directly by the controller (not a dispatched implementer subagent)**, since it required Administrator-elevated changes (registry edits, service restart) that a sandboxed subagent cannot perform. Any other developer setting up this project on a machine without a pre-existing SQL Server instance should still use the Docker approach below, or install SQL Server Express/Developer Edition themselves — the `DATABASE_URL` contract is what matters, not which of the two hosts it.

**Files:**
- Modify: `.env.example` (username changed from `sa` to a dedicated least-privilege login, see below)

**Interfaces:**
- Produces: a SQL Server instance reachable at `localhost:1433`, matching `DATABASE_URL` in `.env.example`.

**What was actually done (native SQL Server Express, requires an elevated/Administrator PowerShell):**
1. Enabled the TCP/IP protocol for the SQLEXPRESS instance (`ServerNetworkProtocol` WMI class under `root\Microsoft\SqlServer\ComputerManagement15`, `SetEnable()`).
2. Set a static TCP port of 1433 (cleared `TcpDynamicPorts`, set `TcpPort` under the instance's `SuperSocketNetLib\Tcp\IPAll` registry key) — SQL Express defaults to a dynamic port, which won't match a fixed `DATABASE_URL`.
3. Enabled Mixed Mode authentication (`LoginMode = 2` under the instance's `MSSQLServer` registry key) — the instance defaulted to Windows-Authentication-only, but the app connects with a SQL login/password, not Windows auth.
4. Restarted the `MSSQL$SQLEXPRESS` service for the above to take effect, and started `SQLBrowser`.
5. Created a dedicated `examapp` database and a dedicated SQL login `examapp_dev` (password `DevPassw0rd!2026`, matching the plan's existing dev-password convention) granted `db_owner` on that database only — deliberately not using the built-in `sa` account, per this project's least-privilege posture.

The full script used is preserved at `.superpowers/sdd/setup-sqlexpress.ps1` for reference (this file is gitignored scratch, not part of the committed codebase).

**Resulting `.env.example` change:**
```
DATABASE_URL="sqlserver://localhost:1433;database=examapp;user=examapp_dev;password=DevPassw0rd!2026;trustServerCertificate=true"
```
(Only the `user` value changed, from `sa` to `examapp_dev` — database name, port, and password were already consistent with this task's original intent.)

**Original Docker-based approach (for other developers / CI, where Docker is available):**

`docker-compose.yml`:
```yaml
version: "3.9"
services:
  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "DevPassw0rd!2026"
      MSSQL_PID: "Developer"
    ports:
      - "1433:1433"
    volumes:
      - sqlserver-data:/var/opt/mssql
volumes:
  sqlserver-data:
```
Run: `docker compose up -d` then `docker exec -it $(docker compose ps -q sqlserver) /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P 'DevPassw0rd!2026' -C -Q "SELECT 1"`
Expected: query returns `1`. Note: with this approach, the `.env.example` `user` value would need to be `sa` again, or a dedicated login created inside the container the same way as above.

**Verification performed (either approach):**
`sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT 1 AS connected" -C` → returned `1` — confirms the server is accepting TCP connections with the credentials that match `.env.example`'s `DATABASE_URL`.

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add local SQL Server via docker-compose"
```

---

### Task 3: Prisma schema (Phase 0 models) & initial migration

**Deviation from original plan:** the `examapp_dev` login (see Task 2) has `db_owner` on the `examapp` database only — it deliberately lacks server-level `CREATE DATABASE` permission. Prisma's `prisma migrate dev` apply step needs a "shadow database" (created and dropped on the fly) to detect schema drift, and creating that shadow database requires `CREATE DATABASE`. Since that permission isn't available (by design — least-privilege login, not `sa`), **`npx prisma migrate deploy` must be used instead of `npx prisma migrate dev` whenever *applying* migrations in this project, going forward.** `migrate deploy` applies existing migration files in order and does not require a shadow database — it's the tool Prisma designed for exactly this kind of environment (production/CI-style, minimal-permission DB login). `migrate dev --create-only` is unaffected and still the right tool for *generating* a new migration's SQL (it also doesn't need a shadow database when `--create-only` is passed). This same substitution applies to Task 4's apply step below.

An earlier pass at this task ran plain `prisma db push` as a workaround, which pushed the 7 tables directly to `examapp` without creating the `_prisma_migrations` history table. That was corrected: the database was reset to empty and `init_schema` was applied properly via `migrate deploy`, producing both the 7 tables and a `_prisma_migrations` row recording the migration as applied. See `.superpowers/sdd/task-3-report.md` for the fix log.

**Files:**
- Create: `apps/api/prisma/schema.prisma`
- Create: `apps/api/.env` (copied from root `.env.example`, gitignored)

**Interfaces:**
- Produces: Prisma Client models `Plan`, `Organization`, `User`, `Permission`, `RolePermission`, `RefreshToken`, `AuditLog` — these exact names/fields are relied on by every later task.

- [ ] **Step 1: Write the schema**

`apps/api/prisma/schema.prisma`:
```prisma
datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model Plan {
  id                     String         @id @default(uuid())
  name                   String
  candidateLimit         Int            @map("candidate_limit")
  aiCreditLimit          Int            @map("ai_credit_limit")
  proctoringMinutesLimit Int            @map("proctoring_minutes_limit")
  createdAt              DateTime       @default(now()) @map("created_at")
  organizations          Organization[]

  @@map("plans")
}

model Organization {
  id        String     @id @default(uuid())
  name      String
  slug      String     @unique
  region    String     @default("us")
  status    String     @default("active")
  planId    String     @map("plan_id")
  plan      Plan       @relation(fields: [planId], references: [id])
  createdAt DateTime   @default(now()) @map("created_at")
  users     User[]
  auditLogs AuditLog[]

  @@map("organizations")
}

model User {
  id             String         @id @default(uuid())
  organizationId String?        @map("organization_id")
  organization   Organization?  @relation(fields: [organizationId], references: [id])
  email          String
  passwordHash   String         @map("password_hash")
  role           String
  status         String         @default("active")
  lastLoginAt    DateTime?      @map("last_login_at")
  createdAt      DateTime       @default(now()) @map("created_at")
  refreshTokens  RefreshToken[]

  @@unique([organizationId, email])
  @@map("users")
}

model Permission {
  id              String           @id @default(uuid())
  key             String           @unique
  description     String
  rolePermissions RolePermission[]

  @@map("permissions")
}

model RolePermission {
  role         String
  permissionId String     @map("permission_id")
  permission   Permission @relation(fields: [permissionId], references: [id])

  @@id([role, permissionId])
  @@map("role_permissions")
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String    @map("user_id")
  user      User      @relation(fields: [userId], references: [id])
  tokenHash String    @map("token_hash")
  familyId  String    @map("family_id")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  @@map("refresh_tokens")
}

model AuditLog {
  id             String        @id @default(uuid())
  organizationId String?       @map("organization_id")
  organization   Organization? @relation(fields: [organizationId], references: [id])
  actorUserId    String?       @map("actor_user_id")
  action         String
  entityType     String        @map("entity_type")
  entityId       String?       @map("entity_id")
  metadataJson   String?       @map("metadata_json") @db.NVarChar(Max)
  createdAt      DateTime      @default(now()) @map("created_at")

  @@map("audit_logs")
}
```

- [ ] **Step 2: Copy env, generate the migration, then apply it**

Run: `cp .env.example apps/api/.env` then, from `apps/api/`: `npx prisma migrate dev --name init_schema --create-only`
Expected: a new folder `apps/api/prisma/migrations/<timestamp>_init_schema/migration.sql` is created containing `CREATE TABLE` statements for all 7 tables. Do not apply yet — Task 4 appends RLS objects to this same file before it's run.

When it's time to actually apply the migration (i.e. after Task 4 has finished appending its RLS SQL to this file), run `npx prisma migrate deploy` — **not** `npx prisma migrate dev` — for the reason explained in this task's deviation note above (no `CREATE DATABASE` permission for a shadow database).

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add Phase 0 Prisma schema (orgs, users, RBAC tables, audit log)"
```

---

### Task 4: Row-Level Security enforcement + TenantPrismaService

**Deviations from the original plan (both discovered and fixed during implementation):**

1. **Migration split into two files, not one.** `prisma migrate deploy` sends each `migration.sql` file to SQL Server as a single batch, and `GO` is a `sqlcmd`/SSMS batch separator, not valid T-SQL — it isn't supported inside a single Prisma migration file. `CREATE FUNCTION` must also be the only statement in its batch. The fix: the RLS SQL below is split across two migration folders — `..._tenant_rls_function` (the `CREATE FUNCTION`) and `..._tenant_rls_policy` (the `CREATE SECURITY POLICY`) — applied in that order, each with no `GO` needed since each file is already a single batch.
2. **`TenantPrismaService.forTenant` must reset session context before returning, not just set it.** `sp_set_session_context` is scoped to the physical database connection, not the transaction — it is not undone by commit or rollback. Prisma pools and reuses physical connections across unrelated calls. Without an explicit reset, a connection that just ran `forTenant({organizationId: orgA, ...})` gets returned to the pool still carrying org A's context, and a later plain `prisma.user.findMany()` call (bypassing `forTenant` entirely) that happens to reuse that same pooled connection would silently inherit org A's access — the exact opposite of the "fails closed by default" guarantee this task exists to build. This was caught by Step 5's own isolation test failing deterministically (3/4 passing, the "zero rows with no context set" assertion failing) during implementation, not discovered later. The fix, included in Step 3's code below: reset both session context keys to `NULL`/`0` in a `finally` block, inside the same transaction callback, before it returns — this runs on the same reserved connection, before Prisma commits and releases it back to the pool.

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_tenant_rls_function/migration.sql`
- Create: `apps/api/prisma/migrations/<timestamp>_tenant_rls_policy/migration.sql`
- Create: `apps/api/src/prisma/prisma.service.ts`
- Create: `apps/api/src/prisma/prisma.module.ts`
- Create: `apps/api/src/prisma/tenant-context.ts`
- Create: `apps/api/src/prisma/tenant-prisma.service.ts`
- Test: `apps/api/test/tenant-isolation.e2e-spec.ts`

**Interfaces:**
- Consumes: Prisma models from Task 3.
- Produces: `TenantContext` type `{ organizationId: string | null; isSuperAdmin: boolean }`; `TenantPrismaService.forTenant<T>(context: TenantContext, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>` — every later task that queries `users` or `audit_logs` must go through this method.

- [ ] **Step 1: Create the RLS migration files**

`apps/api/prisma/migrations/<timestamp>_tenant_rls_function/migration.sql`:
```sql
-- Row-Level Security: tenant isolation backstop for users and audit_logs.
-- Predicate returns true (row visible) when the session is flagged as
-- super-admin, OR when the row's organization id matches the session's
-- current org. With no session context set, both branches are false,
-- so queries return zero rows by default (secure by default).
CREATE FUNCTION dbo.fn_tenant_access_predicate(@OrgId UNIQUEIDENTIFIER)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS fn_result
WHERE (
  CONVERT(BIT, ISNULL(SESSION_CONTEXT(N'app_is_super_admin'), 0)) = 1
)
OR (
  @OrgId IS NOT NULL
  AND TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N'app_current_org')) = @OrgId
);
```

`apps/api/prisma/migrations/<timestamp>_tenant_rls_policy/migration.sql` (must apply after the function migration above):
```sql
CREATE SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.users AFTER UPDATE,
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.audit_logs,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.audit_logs AFTER INSERT
WITH (STATE = ON);
```

Note: `organizations` intentionally has no row-filter policy — resolving an organization by slug is a legitimate pre-authentication lookup (Task 8 needs it to find which org a login belongs to before any tenant context exists). Org-level access control there is handled by an app-layer check instead (verified in Task 6).

- [ ] **Step 2: Apply the migrations**

Run: `npx prisma migrate deploy` (from `apps/api/`) — not `npx prisma migrate dev`; see Task 3's note on why `migrate deploy` is used instead of `migrate dev` in this project (the `examapp_dev` login lacks `CREATE DATABASE` permission for Prisma's shadow database).
Expected: migration applies cleanly. Run `npx prisma generate` afterward (this is a separate step with `migrate deploy`, unlike `migrate dev` which runs it automatically) so `@prisma/client` types now include all 7 models.

- [ ] **Step 3: Write the Prisma service and tenant context type**

`apps/api/src/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`apps/api/src/prisma/tenant-context.ts`:
```typescript
export interface TenantContext {
  organizationId: string | null;
  isSuperAdmin: boolean;
}
```

`apps/api/src/prisma/tenant-prisma.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { TenantContext } from './tenant-context';

@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  async forTenant<T>(
    context: TenantContext,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = ${context.organizationId}`;
      await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = ${context.isSuperAdmin ? 1 : 0}`;
      try {
        return await fn(tx);
      } finally {
        // sp_set_session_context is scoped to the physical connection, not the
        // transaction, and is not undone by rollback. Prisma returns this
        // connection to its pool once this callback resolves, so without this
        // reset a later query that bypasses forTenant on the same pooled
        // connection would silently inherit this request's tenant context.
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_org', @value = NULL`;
        await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 0`;
      }
    });
  }
}
```

`apps/api/src/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantPrismaService } from './tenant-prisma.service';

@Global()
@Module({
  providers: [PrismaService, TenantPrismaService],
  exports: [PrismaService, TenantPrismaService],
})
export class PrismaModule {}
```

Register it in `apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
})
export class AppModule {}
```

- [ ] **Step 4: Write the failing isolation test**

`apps/api/test/tenant-isolation.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { randomUUID } from 'crypto';

describe('Tenant Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: 'test-plan', candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 100 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({
      data: { name: 'Org A', slug: `org-a-${randomUUID()}`, planId },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Org B', slug: `org-b-${randomUUID()}`, planId },
    });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgAId, email: 'admin@org-a.test', passwordHash: 'x', role: 'org_admin' },
      }),
    );
    await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgBId, email: 'admin@org-b.test', passwordHash: 'x', role: 'org_admin' },
      }),
    );
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('scopes results to the current tenant when a context is set', async () => {
    const orgAUsers = await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.findMany({ where: { organizationId: orgAId } }),
    );
    expect(orgAUsers).toHaveLength(1);
    expect(orgAUsers[0].email).toBe('admin@org-a.test');
  });

  it('never returns another tenant\'s rows even if queried without a filter', async () => {
    const orgAUsers = await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.user.findMany(),
    );
    expect(orgAUsers.every((u) => u.organizationId === orgAId)).toBe(true);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.user.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });

  it('lets a super-admin context see rows across tenants', async () => {
    const allUsers = await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findMany({ where: { organizationId: { in: [orgAId, orgBId] } } }),
    );
    expect(allUsers).toHaveLength(2);
  });
});
```

- [ ] **Step 5: Run the test to confirm it passes against the real RLS policy**

Run: `npm run test:api:e2e -- tenant-isolation`
Expected: `4 passed`. If the "zero rows when no context set" test fails (returns rows instead), the security policy did not apply — stop and re-check Step 1's migration SQL before continuing; this is the core security guarantee of the whole platform and must be green before building anything on top of it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/migrations apps/api/src/prisma apps/api/test/tenant-isolation.e2e-spec.ts
git commit -m "feat: enforce tenant isolation via SQL Server Row-Level Security + TenantPrismaService"
```

---

### Task 5: Seed script — plan, permissions, bootstrap accounts

**Files:**
- Create: `apps/api/prisma/seed.ts`
- Modify: `apps/api/package.json` (add `prisma.seed` config)

**Interfaces:**
- Produces: one `Plan` ("trial"), 4 permissions (`platform:manage_organizations`, `org:manage_users`, `org:manage_settings`, `org:view`), `role_permissions` grants, one super_admin user (`super@platform.test` / `DevSuper123!`), one demo organization (`slug: "demo-org"`) with one org_admin user (`admin@demo-org.test` / `DevAdmin123!`).

- [ ] **Step 1: Write the seed script**

`apps/api/prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
  { key: 'platform:manage_organizations', description: 'Create and manage organizations (Super Admin only)' },
  { key: 'org:manage_users', description: 'Invite and manage users within an organization' },
  { key: 'org:manage_settings', description: 'Edit organization branding/domain/security settings' },
  { key: 'org:view', description: 'View organization dashboard and data' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view'],
  panel: ['org:view'],
};

async function main() {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: perm.key },
      update: {},
      create: perm,
    });
  }

  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
    for (const key of keys) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key } });
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role, permissionId: permission.id } },
        update: {},
        create: { role, permissionId: permission.id },
      });
    }
  }

  const trialPlan = await prisma.plan.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'trial',
      candidateLimit: 100,
      aiCreditLimit: 10,
      proctoringMinutesLimit: 60,
    },
  });

  const superAdminHash = await argon2.hash('DevSuper123!');
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: null as unknown as string, email: 'super@platform.test' } },
    update: {},
    create: {
      email: 'super@platform.test',
      passwordHash: superAdminHash,
      role: 'super_admin',
      organizationId: null,
    },
  });

  const demoOrg = await prisma.organization.upsert({
    where: { slug: 'demo-org' },
    update: {},
    create: { name: 'Demo Org', slug: 'demo-org', planId: trialPlan.id },
  });

  const orgAdminHash = await argon2.hash('DevAdmin123!');
  await prisma.user.upsert({
    where: { organizationId_email: { organizationId: demoOrg.id, email: 'admin@demo-org.test' } },
    update: {},
    create: {
      email: 'admin@demo-org.test',
      passwordHash: orgAdminHash,
      role: 'org_admin',
      organizationId: demoOrg.id,
    },
  });

  console.log('Seed complete: super@platform.test / DevSuper123!, admin@demo-org.test / DevAdmin123! (org slug: demo-org)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Note: the seed script uses the raw `PrismaClient` directly (not `TenantPrismaService`), because it runs outside of any HTTP request/session context. This is the one place in the codebase permitted to bypass the tenant helper — it's a one-time bootstrap script, not request-serving application code.

Add to `apps/api/package.json`:
```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

- [ ] **Step 2: Run the seed and verify**

Run: `npx prisma db seed` (from `apps/api/`)
Expected: console prints the seed-complete message; re-running the same command is idempotent (no duplicate-key errors) because every write uses `upsert`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/seed.ts apps/api/package.json
git commit -m "feat: add seed script for permissions, trial plan, and bootstrap accounts"
```

---

### Task 6: Organizations module (Super Admin creates an organization)

**Files:**
- Create: `apps/api/src/organizations/organizations.module.ts`
- Create: `apps/api/src/organizations/organizations.service.ts`
- Create: `apps/api/src/organizations/organizations.controller.ts`
- Create: `apps/api/src/organizations/dto/create-organization.dto.ts`
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 4) — organizations table has no RLS, so this service uses the plain `PrismaService`, not `TenantPrismaService`.
- Produces: `OrganizationsService.create(dto: CreateOrganizationDto): Promise<Organization>`, used later by e2e smoke test (Task 12).

- [ ] **Step 1: Write the DTO**

`apps/api/src/organizations/dto/create-organization.dto.ts`:
```typescript
import { IsIn, IsString, Matches, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug: string;

  @IsIn(['us', 'eu'])
  region: string;

  @IsString()
  planId: string;
}
```

- [ ] **Step 2: Write the failing unit test for the service**

`apps/api/src/organizations/organizations.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: { organization: { findUnique: jest.Mock; create: jest.Mock } };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn(), create: jest.fn() } };
    const moduleRef = await Test.createTestingModule({
      providers: [OrganizationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(OrganizationsService);
  });

  it('creates an organization when the slug is free', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'plan-1' });

    const result = await service.create({ name: 'Acme', slug: 'acme', region: 'us', planId: 'plan-1' });

    expect(result.slug).toBe('acme');
    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: { name: 'Acme', slug: 'acme', region: 'us', planId: 'plan-1' },
    });
  });

  it('rejects a duplicate slug', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'existing-org' });

    await expect(
      service.create({ name: 'Acme 2', slug: 'acme', region: 'us', planId: 'plan-1' }),
    ).rejects.toThrow(ConflictException);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:api -- organizations.service`
Expected: FAIL — `OrganizationsService` is not defined yet.

- [ ] **Step 4: Implement the service and controller**

`apps/api/src/organizations/organizations.service.ts`:
```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Organization slug "${dto.slug}" is already taken`);
    }
    return this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, region: dto.region, planId: dto.planId },
    });
  }
}
```

`apps/api/src/organizations/organizations.controller.ts`:
```typescript
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';

@Controller('organizations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @RequirePermissions('platform:manage_organizations')
  create(@Body() dto: CreateOrganizationDto) {
    return this.organizationsService.create(dto);
  }
}
```

`apps/api/src/organizations/organizations.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:api -- organizations.service`
Expected: `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/organizations
git commit -m "feat: add organizations module with slug-uniqueness enforcement"
```

---

### Task 7: RBAC guard (permissions decorator + guard)

**Files:**
- Create: `apps/api/src/rbac/permissions.decorator.ts`
- Create: `apps/api/src/rbac/permissions.guard.ts`
- Create: `apps/api/src/rbac/rbac.module.ts`
- Test: `apps/api/src/rbac/permissions.guard.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 4), `request.user` shape `{ userId: string; organizationId: string | null; role: string }` (defined by Task 8's `JwtStrategy`).
- Produces: `@RequirePermissions(...keys: string[])` decorator and `PermissionsGuard` — used by `OrganizationsController` (Task 6) and `UsersController` (Task 9).

- [ ] **Step 1: Write the decorator**

`apps/api/src/rbac/permissions.decorator.ts`:
```typescript
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
```

- [ ] **Step 2: Write the failing test for the guard**

`apps/api/src/rbac/permissions.guard.spec.ts`:
```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';

function mockContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows access when the route requires no permissions', async () => {
    const reflector = { get: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn() } };
    const guard = new PermissionsGuard(reflector, prisma as any);

    const result = await guard.canActivate(mockContext({ role: 'recruiter' }));
    expect(result).toBe(true);
  });

  it('allows access when the role has the required permission', async () => {
    const reflector = { get: jest.fn().mockReturnValue(['org:manage_users']) } as unknown as Reflector;
    const prisma = {
      rolePermission: {
        findMany: jest.fn().mockResolvedValue([{ permission: { key: 'org:manage_users' } }]),
      },
    };
    const guard = new PermissionsGuard(reflector, prisma as any);

    const result = await guard.canActivate(mockContext({ role: 'org_admin' }));
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when the role lacks the required permission', async () => {
    const reflector = { get: jest.fn().mockReturnValue(['platform:manage_organizations']) } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
    const guard = new PermissionsGuard(reflector, prisma as any);

    await expect(guard.canActivate(mockContext({ role: 'org_admin' }))).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:api -- permissions.guard`
Expected: FAIL — `PermissionsGuard` is not defined yet.

- [ ] **Step 4: Implement the guard**

`apps/api/src/rbac/permissions.guard.ts`:
```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler());
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role: string } | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const grants = await this.prisma.rolePermission.findMany({
      where: { role: user.role, permission: { key: { in: required } } },
      select: { permission: { select: { key: true } } },
    });
    const grantedKeys = new Set(grants.map((g) => g.permission.key));
    const hasAll = required.every((key) => grantedKeys.has(key));
    if (!hasAll) {
      throw new ForbiddenException(`Missing required permission(s): ${required.join(', ')}`);
    }
    return true;
  }
}
```

`apps/api/src/rbac/rbac.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';

@Global()
@Module({
  providers: [PermissionsGuard],
  exports: [PermissionsGuard],
})
export class RbacModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:api -- permissions.guard`
Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/rbac
git commit -m "feat: add permission-based RBAC guard"
```

---

### Task 8: Auth module — login, JWT issuance, refresh rotation, logout

**Files:**
- Create: `apps/api/src/auth/dto/login.dto.ts`
- Create: `apps/api/src/auth/dto/refresh.dto.ts`
- Create: `apps/api/src/auth/jwt.strategy.ts`
- Create: `apps/api/src/auth/jwt-auth.guard.ts`
- Create: `apps/api/src/auth/current-tenant.decorator.ts`
- Create: `apps/api/src/auth/auth.service.ts`
- Create: `apps/api/src/auth/auth.controller.ts`
- Create: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService` (Task 4), `PrismaService` (Task 4, for the org-slug lookup).
- Produces: `AuthService.login(dto): Promise<{ accessToken: string; refreshToken: string }>`, `AuthService.refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>`, `AuthService.logout(refreshToken: string): Promise<void>`. JWT payload shape `{ sub: string; organizationId: string | null; role: string }`, exposed on `request.user` as `{ userId, organizationId, role }`.

- [ ] **Step 1: Write the DTOs**

`apps/api/src/auth/dto/login.dto.ts`:
```typescript
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional()
  @IsString()
  organizationSlug?: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}
```

`apps/api/src/auth/dto/refresh.dto.ts`:
```typescript
import { IsString } from 'class-validator';

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
```

- [ ] **Step 2: Write the failing test for the auth service**

`apps/api/src/auth/auth.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { organization: { findUnique: jest.Mock }; refreshToken: { create: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        JwtService,
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });

  it('rejects login when the org slug does not resolve', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ organizationSlug: 'no-such-org', email: 'a@b.com', password: 'x' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects login on a wrong password', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', passwordHash,
    });

    await expect(
      service.login({ organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('issues an access and refresh token on correct credentials', async () => {
    const passwordHash = await argon2.hash('correct-password');
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    tenantPrisma.forTenant.mockResolvedValueOnce({
      id: 'user-1', organizationId: 'org-1', role: 'org_admin', passwordHash,
    });
    tenantPrisma.forTenant.mockResolvedValueOnce(undefined);
    prisma.refreshToken.create.mockResolvedValue({});

    const result = await service.login({
      organizationSlug: 'demo-org', email: 'admin@demo-org.test', password: 'correct-password',
    });

    expect(result.accessToken).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    const decoded = jwt.decode(result.accessToken) as { organizationId: string; role: string };
    expect(decoded.organizationId).toBe('org-1');
    expect(decoded.role).toBe('org_admin');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:api -- auth.service`
Expected: FAIL — `AuthService` is not defined yet.

- [ ] **Step 4: Implement the auth service**

`apps/api/src/auth/auth.service.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { LoginDto } from './dto/login.dto';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<TokenPair> {
    let organizationId: string | null = null;

    if (dto.organizationSlug) {
      const org = await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } });
      if (!org) {
        throw new UnauthorizedException('Invalid credentials');
      }
      organizationId = org.id;
    }

    const isSuperAdminLookup = !dto.organizationSlug;
    const user = await this.tenantPrisma.forTenant(
      { organizationId, isSuperAdmin: isSuperAdminLookup },
      (tx) =>
        tx.user.findFirst({
          where: isSuperAdminLookup
            ? { email: dto.email, role: 'super_admin', organizationId: null }
            : { email: dto.email, organizationId },
        }),
    );

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user.id, user.organizationId, user.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = await argon2.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, familyId: payload.familyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored || !(await argon2.verify(stored.tokenHash, refreshToken).catch(() => false))) {
      // Reuse of an already-rotated/unknown token: revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: payload.sub, familyId: payload.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: payload.sub } }),
    );

    return this.issueTokenPair(user.id, user.organizationId, user.role, payload.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.JWT_REFRESH_SECRET });
    } catch {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, familyId: payload.familyId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(
    userId: string,
    organizationId: string | null,
    role: string,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const accessToken = this.jwt.sign(
      { sub: userId, organizationId, role },
      { secret: process.env.JWT_ACCESS_SECRET, expiresIn: `${process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900}s` },
    );
    const refreshToken = this.jwt.sign(
      { sub: userId, familyId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: `${process.env.REFRESH_TOKEN_TTL_DAYS ?? 30}d` },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:api -- auth.service`
Expected: `3 passed`.

- [ ] **Step 6: Write the JWT strategy, guard, tenant decorator, controller, and module**

`apps/api/src/auth/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  organizationId: string | null;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
    });
  }

  validate(payload: JwtPayload) {
    return { userId: payload.sub, organizationId: payload.organizationId, role: payload.role };
  }
}
```

`apps/api/src/auth/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`apps/api/src/auth/current-tenant.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../prisma/tenant-context';

export const CurrentTenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const request = ctx.switchToHttp().getRequest();
  const user = request.user as { organizationId: string | null; role: string } | undefined;
  return {
    organizationId: user?.organizationId ?? null,
    isSuperAdmin: user?.role === 'super_admin',
  };
});
```

`apps/api/src/auth/auth.controller.ts`:
```typescript
import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';

const REFRESH_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('staff/login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.login(dto);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    const tokens = await this.authService.refresh(dto.refreshToken);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false });
    return { accessToken: tokens.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(dto.refreshToken);
    res.clearCookie(REFRESH_COOKIE);
    return { success: true };
  }
}
```

`apps/api/src/auth/auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth
git commit -m "feat: add staff auth — login, JWT issuance, refresh rotation with reuse detection, logout"
```

---

### Task 9: Users module (Org Admin creates a user in their own org)

**Files:**
- Create: `apps/api/src/users/dto/create-user.dto.ts`
- Create: `apps/api/src/users/users.service.ts`
- Create: `apps/api/src/users/users.controller.ts`
- Create: `apps/api/src/users/users.module.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService` (Task 4), `TenantContext` (Task 4), `CurrentTenant` decorator (Task 8).
- Produces: `UsersService.create(context: TenantContext, dto: CreateUserDto): Promise<User>` — enforces `context.organizationId` is set (rejects platform-level calls with no org).

- [ ] **Step 1: Write the DTO**

`apps/api/src/users/dto/create-user.dto.ts`:
```typescript
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(['org_admin', 'recruiter', 'panel'])
  role: string;
}
```

- [ ] **Step 2: Write the failing test for the service**

`apps/api/src/users/users.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [UsersService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('rejects creating a user with no organization context', async () => {
    await expect(
      service.create({ organizationId: null, isSuperAdmin: true }, { email: 'a@b.com', password: 'password1', role: 'recruiter' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates a user scoped to the caller\'s organization', async () => {
    tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'a@b.com', organizationId: 'org-1', role: 'recruiter' });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result.organizationId).toBe('org-1');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:api -- users.service`
Expected: FAIL — `UsersService` is not defined yet.

- [ ] **Step 4: Implement the service, controller, and module**

`apps/api/src/users/users.service.ts`:
```typescript
import { BadRequestException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, dto: CreateUserDto): Promise<User> {
    if (!context.organizationId) {
      throw new BadRequestException('A user must be created within an organization');
    }

    const passwordHash = await argon2.hash(dto.password);
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.create({
        data: {
          organizationId: context.organizationId as string,
          email: dto.email,
          passwordHash,
          role: dto.role,
        },
      }),
    );
  }

  async list(context: TenantContext): Promise<User[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findMany({ where: { organizationId: context.organizationId } }),
    );
  }
}
```

`apps/api/src/users/users.controller.ts`:
```typescript
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('org:manage_users')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenant, dto);
  }

  @Get()
  @RequirePermissions('org:view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.usersService.list(tenant);
  }
}
```

`apps/api/src/users/users.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:api -- users.service`
Expected: `2 passed`.

- [ ] **Step 6: Wire all modules together in `AppModule`**

`apps/api/src/app.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RbacModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users apps/api/src/app.module.ts
git commit -m "feat: add users module (org-scoped create/list) and wire full AppModule"
```

---

### Task 10: Audit logging on login and user/org creation

**Files:**
- Create: `apps/api/src/audit/audit.service.ts`
- Create: `apps/api/src/audit/audit.module.ts`
- Modify: `apps/api/src/auth/auth.service.ts` (log successful login)
- Modify: `apps/api/src/auth/auth.module.ts` (import AuditModule)
- Modify: `apps/api/src/users/users.service.ts` (log user creation)
- Modify: `apps/api/src/users/users.module.ts` (import AuditModule)
- Test: `apps/api/src/audit/audit.service.spec.ts`

**Interfaces:**
- Produces: `AuditService.record(context: TenantContext, entry: { actorUserId: string | null; action: string; entityType: string; entityId?: string; metadata?: Record<string, unknown> }): Promise<void>` — insert-only, no update/delete methods exist on this service by design.

- [ ] **Step 1: Write the failing test**

`apps/api/src/audit/audit.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { AuditService } from './audit.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('AuditService', () => {
  let service: AuditService;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn().mockImplementation((_ctx, fn) => fn({ auditLog: { create: jest.fn() } })) };
    const moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  it('records an audit entry scoped to the tenant context', async () => {
    await service.record(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'user.created', entityType: 'user', entityId: 'user-2' },
    );

    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, expect.any(Function));
  });

  it('serializes metadata to a JSON string', async () => {
    const create = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ auditLog: { create } }));

    await service.record(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'login.success', entityType: 'user', entityId: 'user-1', metadata: { ip: '127.0.0.1' } },
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadataJson: JSON.stringify({ ip: '127.0.0.1' }) }),
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:api -- audit.service`
Expected: FAIL — `AuditService` is not defined yet.

- [ ] **Step 3: Implement the service**

`apps/api/src/audit/audit.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';

interface AuditEntry {
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async record(context: TenantContext, entry: AuditEntry): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: entry.actorUserId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadataJson: entry.metadata ? JSON.stringify(entry.metadata) : null,
        },
      }),
    );
  }
}
```

`apps/api/src/audit/audit.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:api -- audit.service`
Expected: `2 passed`.

- [ ] **Step 5: Wire audit logging into login and user creation**

In `apps/api/src/auth/auth.service.ts`, add `AuditService` to the constructor and call it after a successful login. Replace the constructor and the end of `login()`:
```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}
```
And replace the final line of `login()` (`return this.issueTokenPair(user.id, user.organizationId, user.role);`) with:
```typescript
    const tokens = await this.issueTokenPair(user.id, user.organizationId, user.role);
    await this.audit.record(
      { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' },
      { actorUserId: user.id, action: 'login.success', entityType: 'user', entityId: user.id },
    );
    return tokens;
```
Add the import: `import { AuditService } from '../audit/audit.service';`

In `apps/api/src/auth/auth.module.ts`, add `AuditModule` to `imports`.

In `apps/api/src/users/users.service.ts`, add `AuditService` to the constructor and call it after creation:
```typescript
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}
```
Replace the `create()` method body's return with a variable capture and audit call:
```typescript
  async create(context: TenantContext, dto: CreateUserDto): Promise<User> {
    if (!context.organizationId) {
      throw new BadRequestException('A user must be created within an organization');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.create({
        data: {
          organizationId: context.organizationId as string,
          email: dto.email,
          passwordHash,
          role: dto.role,
        },
      }),
    );
    await this.audit.record(context, {
      actorUserId: null,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
    });
    return user;
  }
```
Add the import: `import { AuditService } from '../audit/audit.service';`

In `apps/api/src/users/users.module.ts`, add `AuditModule` to `imports`.

In `apps/api/src/app.module.ts`, add `AuditModule` to `imports` (before `AuthModule` and `UsersModule`).

- [ ] **Step 6: Run the full unit test suite to confirm nothing broke**

Run: `npm run test:api`
Expected: all suites pass (organizations, permissions.guard, auth.service, users.service, audit.service).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/audit apps/api/src/auth apps/api/src/users apps/api/src/app.module.ts
git commit -m "feat: add insert-only audit logging on login and user creation"
```

---

### Task 11: Frontend shell — login page and protected dashboard

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/next.config.js`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/lib/api-client.ts`
- Create: `apps/web/lib/auth-context.tsx`
- Create: `apps/web/app/layout.tsx`
- Create: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `POST /api/v1/auth/staff/login`, `GET /api/v1/users` (Task 9) as the "protected route" proof.
- Produces: a running Next.js app on `http://localhost:3000` demonstrating the full login → protected-page flow manually.

- [ ] **Step 1: Scaffold the Next.js app**

`apps/web/package.json`:
```json
{
  "name": "@exam-platform/web",
  "version": "0.0.1",
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  },
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "typescript": "^5.3.3"
  }
}
```

`apps/web/next.config.js`:
```javascript
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
};
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["dom", "dom.iterable", "esnext"],
    "noEmit": true
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 2: Write the API client and auth context**

`apps/web/lib/api-client.ts`:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

export async function apiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  return response.json();
}
```

`apps/web/lib/auth-context.tsx`:
```typescript
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextValue {
  accessToken: string | null;
  setAccessToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  return <AuthContext.Provider value={{ accessToken, setAccessToken }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

Note: the access token deliberately lives only in in-memory React state (lost on full page reload) — this matches the Security Design (access token is not persisted in `localStorage`, only the httpOnly refresh cookie survives a reload; a production build would add a silent-refresh-on-load call using that cookie, which is out of scope for this Phase 0 skeleton).

- [ ] **Step 3: Write the layout, login page, and dashboard page**

`apps/web/app/layout.tsx`:
```tsx
import { AuthProvider } from '../lib/auth-context';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
```

`apps/web/app/login/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { setAccessToken } = useAuth();
  const [organizationSlug, setOrganizationSlug] = useState('demo-org');
  const [email, setEmail] = useState('admin@demo-org.test');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
      });
      setAccessToken(result.accessToken);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <main>
      <h1>Staff Login</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Organization slug (leave blank for platform login)
          <input value={organizationSlug} onChange={(e) => setOrganizationSlug(e.target.value)} />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit">Log in</button>
      </form>
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

`apps/web/app/dashboard/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '../../lib/api-client';
import { useAuth } from '../../lib/auth-context';

interface UserRow {
  id: string;
  email: string;
  role: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      router.push('/login');
      return;
    }
    apiFetch('/users', {}, accessToken)
      .then(setUsers)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load users'));
  }, [accessToken, router]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <ul>
        {users?.map((user) => (
          <li key={user.id}>
            {user.email} — {user.role}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Install and smoke-test manually**

Run: `npm install` (root), then in one terminal `npm run dev:api`, in another `npm run dev:web`.
Expected: visiting `http://localhost:3000/login`, logging in with `admin@demo-org.test` / `DevAdmin123!` (seeded in Task 5) and organization slug `demo-org` redirects to `/dashboard`, which lists that org's users.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "feat: add Next.js frontend shell with login and protected dashboard"
```

---

### Task 12: End-to-end smoke test and README

**Files:**
- Create: `apps/api/test/auth-flow.e2e-spec.ts`
- Create: `README.md`

**Interfaces:**
- Produces: an automated proof of the full Phase 0 deliverable (create org → create user → log in → hit protected route), runnable in CI later without a browser.

- [ ] **Step 1: Write the end-to-end test**

`apps/api/test/auth-flow.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';

describe('Full Phase 0 flow: create org -> create user -> login -> protected route', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgSlug: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `e2e-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;
  });

  afterAll(async () => {
    if (orgId) {
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    }
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('bootstraps a super-admin JWT, creates an org, creates a user in it, then logs in as that user', async () => {
    orgSlug = `e2e-org-${randomUUID()}`;

    // Seed a super admin directly (bypassing HTTP — the seed script is the real bootstrap path).
    const superAdmin = await prisma.user.create({
      data: {
        email: `super-${randomUUID()}@platform.test`,
        passwordHash: await argon2.hash('SuperPassw0rd!'),
        role: 'super_admin',
        organizationId: null,
      },
    });

    const superLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ email: superAdmin.email, password: 'SuperPassw0rd!' })
      .expect(200);
    const superAccessToken = superLogin.body.accessToken;

    const createOrgResponse = await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${superAccessToken}`)
      .send({ name: 'E2E Org', slug: orgSlug, region: 'us', planId })
      .expect(201);
    orgId = createOrgResponse.body.id;

    // An org_admin must exist to call /users — create one directly for this test's bootstrap,
    // mirroring what the seed script does for the demo org.
    const orgAdminPasswordHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({
        data: { organizationId: orgId, email: 'admin@e2e-org.test', passwordHash: orgAdminPasswordHash, role: 'org_admin' },
      }),
    );

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: orgSlug, email: 'admin@e2e-org.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    const orgAdminAccessToken = orgAdminLogin.body.accessToken;

    const createUserResponse = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ email: 'recruiter@e2e-org.test', password: 'RecruiterPassw0rd!', role: 'recruiter' })
      .expect(201);
    expect(createUserResponse.body.organizationId).toBe(orgId);

    const listUsersResponse = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);
    expect(listUsersResponse.body.map((u: { email: string }) => u.email)).toEqual(
      expect.arrayContaining(['admin@e2e-org.test', 'recruiter@e2e-org.test']),
    );

    await request(app.getHttpServer())
      .post('/api/v1/organizations')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ name: 'Should Fail', slug: `should-fail-${randomUUID()}`, region: 'us', planId })
      .expect(403);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npm run test:api:e2e`
Expected: all e2e suites pass, including this one — proving the entire Phase 0 deliverable end-to-end: an org is created by a super admin, an org admin creates a recruiter user, and RBAC correctly blocks the org admin from the super-admin-only `platform:manage_organizations` action (`403` on the last request).

- [ ] **Step 3: Write the README**

`README.md`:
```markdown
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
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/auth-flow.e2e-spec.ts README.md
git commit -m "test: add full Phase 0 end-to-end smoke test and project README"
```
