# Phase 5a — Async Job Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a durable, tenant-isolated async job queue (BullMQ + Redis) with a generic `AiJob` tracking model, proven end-to-end with one trivial example job type, so Phase 5b can add real AI question generation on top of it without inventing infrastructure mid-feature.

**Architecture:** A new `apps/api/src/jobs/` module: a shared Redis connection feeds one BullMQ `Queue` and one in-process `Worker`; job processors register by a `type` string; every write the decoupled Worker makes reconstructs a `TenantContext` from the job's own persisted `organizationId` rather than relying on any live request context.

**Tech Stack:** NestJS 10, Prisma 5 (SQL Server), BullMQ, ioredis — all new dependencies to `apps/api`.

## Global Constraints

- No separate deployable worker app — the BullMQ `Worker` runs in-process inside `apps/api`.
- `AiJob` is org-scoped and RLS-registered (has an `organizationId` column) — two migrations (schema + RLS), matching every prior schema-touching phase's two-migration pattern.
- `GET /api/v1/ai-jobs/:id` is the only public route this phase adds, gated by a new `ai_jobs:view` permission granted to `recruiter` — never `org:view`.
- No public "create a job" endpoint — `JobsService.enqueue(context, type, inputJson, userId)` is called programmatically by future feature code, not exposed as its own route.
- No automatic BullMQ retries — jobs are added with `{ attempts: 1 }`; a failed job is terminal, matching the master spec's stated design ("recruiter can retry" means a fresh enqueue, not silent background re-processing).
- The Worker reconstructs `TenantContext` as `{ organizationId: job.data.organizationId, isSuperAdmin: false }` for every DB write it makes — never invents an org ID, only ever passes through one captured from a real request at `enqueue()` time.
- The `echo` job type exists only to prove the pipeline end-to-end in this phase — it is not permanent scaffolding, and later sub-phases may remove it once a real job type exists.
- Because `JobsModule` registers into `AppModule`, Redis becomes a hard dependency for booting `apps/api` at all — including every *other* existing e2e test file, not just this phase's own. `createRedisConnection()` defaults to `redis://localhost:6379` when `REDIS_URL` is unset, so existing dev/e2e workflows don't hard-break for anyone who hasn't updated their `.env` yet.

---

## File Structure

- **Create** `apps/api/src/jobs/redis-connection.ts` — one shared `ioredis` connection factory.
- **Create** `apps/api/src/jobs/ai-jobs.queue.ts` — the BullMQ `Queue` provider.
- **Create** `apps/api/src/jobs/ai-jobs.worker.service.ts` — the BullMQ `Worker`, job dispatch, `TenantContext` reconstruction, graceful shutdown.
- **Create** `apps/api/src/jobs/processors/job-processor.interface.ts` — the `JobProcessor` contract + injection token.
- **Create** `apps/api/src/jobs/processors/echo.processor.ts` — the trivial example job type.
- **Create** `apps/api/src/jobs/jobs.service.ts` — `enqueue()` + `getById()`.
- **Create** `apps/api/src/jobs/jobs.controller.ts` — `GET /ai-jobs/:id`.
- **Create** `apps/api/src/jobs/jobs.module.ts` — wires all of the above together.
- **Modify** `apps/api/prisma/schema.prisma` — add the `AiJob` model.
- **Modify** `apps/api/prisma/seed.ts` — add `ai_jobs:view` permission + `recruiter` grant.
- **Modify** `apps/api/src/app.module.ts` — register `JobsModule`.
- **Modify** `apps/api/package.json` — add `bullmq`, `ioredis`.
- **Modify** `.env.example` — add `REDIS_URL`.
- **Modify** `README.md` — document local Redis setup.
- **Create** `docker-compose.yml` (repo root) — local Redis for dev.

---

### Task 1: Schema — `AiJob` model + RLS + permission

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260710120000_ai_jobs_schema/migration.sql`
- Create: `apps/api/prisma/migrations/20260710120001_ai_jobs_rls/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is Task 1).
- Produces: the `AiJob` Prisma model (`id`, `organizationId`, `type`, `status`, `inputJson`, `outputJson`, `error`, `createdBy`, `createdAt`, `updatedAt`) — every later task's DB access goes through this exact shape. The `ai_jobs:view` permission, seeded and granted to `recruiter`.

- [ ] **Step 1: Add the `AiJob` model**

Modify `apps/api/prisma/schema.prisma` — append this model at the end of the file, after `ProctoringAnalysis`:

```prisma
model AiJob {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  type           String
  status         String   @default("pending")
  inputJson      String   @db.NVarChar(Max) @map("input_json")
  outputJson     String?  @db.NVarChar(Max) @map("output_json")
  error          String?  @db.NVarChar(Max)
  createdBy      String   @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@index([organizationId, status])
  @@map("ai_jobs")
}
```

- [ ] **Step 2: Write the schema migration by hand**

`npx prisma migrate dev --create-only` is expected to fail with a P3014 shadow-database permission error — a now well-documented, repeatedly-hit issue in this project (every prior schema-touching phase has hit it). Hand-write the migration instead.

Create `apps/api/prisma/migrations/20260710120000_ai_jobs_schema/migration.sql`:

```sql
-- CreateTable
CREATE TABLE [dbo].[ai_jobs] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [type] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [ai_jobs_status_df] DEFAULT 'pending',
    [input_json] NVARCHAR(MAX) NOT NULL,
    [output_json] NVARCHAR(MAX),
    [error] NVARCHAR(MAX),
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [ai_jobs_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [ai_jobs_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ai_jobs_organization_id_status_idx] ON [dbo].[ai_jobs]([organization_id], [status]);
```

- [ ] **Step 3: Write the RLS migration**

Create `apps/api/prisma/migrations/20260710120001_ai_jobs_rls/migration.sql`:

```sql
-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.ai_jobs. Reuses
-- the existing dbo.fn_tenant_access_predicate function unchanged; this
-- adds predicates to the existing policy, it does not create a new
-- policy or function. The policy is already WITH (STATE = ON), so no
-- state change is needed here.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.ai_jobs,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.ai_jobs AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.ai_jobs AFTER UPDATE;
```

- [ ] **Step 4: Apply the migrations and regenerate the Prisma client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..`
Expected: exit 0, both migrations listed as applied.

If `npx prisma generate` fails with `EPERM` on the query-engine DLL, this is a now-familiar issue caused by a stale orphaned Jest process holding the file locked — check for and kill any leftover `node`/`jest` processes from a prior test run before retrying, matching the established workaround from prior schema-touching phases.

- [ ] **Step 5: Verify directly against the database**

Run this against the dev database (via `sqlcmd`, Azure Data Studio, or an ad hoc Prisma script) and confirm the table and RLS predicates exist:
```sql
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ai_jobs';
SELECT * FROM sys.security_predicates WHERE OBJECT_NAME(target_object_id) = 'ai_jobs';
```
Expected: 10 columns matching the model; 3 security predicates (1 filter, 2 block) targeting `ai_jobs`.

- [ ] **Step 6: Add the `ai_jobs:view` permission to the seed**

Modify `apps/api/prisma/seed.ts` — replace the `PERMISSIONS` array:

```typescript
const PERMISSIONS = [
  { key: 'platform:manage_organizations', description: 'Create and manage organizations (Super Admin only)' },
  { key: 'org:manage_users', description: 'Invite and manage users within an organization' },
  { key: 'org:manage_settings', description: 'Edit organization branding/domain/security settings' },
  { key: 'org:view', description: 'View organization dashboard and data' },
  { key: 'question_bank:manage', description: 'Create, edit, and archive questions in the organization\'s question bank' },
  { key: 'exam:manage', description: 'Create, edit, and archive exams and their sections in the organization' },
  { key: 'candidate:manage', description: 'Add candidates and manage invitations in the organization' },
  { key: 'results:view', description: 'View exam results, reports, and candidate comparisons' },
  { key: 'ai_jobs:view', description: 'Poll the status of AI background jobs' },
];
```

And replace the `ROLE_PERMISSIONS` mapping:

```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage', 'results:view', 'ai_jobs:view'],
  panel: ['org:view', 'results:view'],
};
```

- [ ] **Step 7: Apply the seed change to the dev database**

Run: `cd apps/api && npx prisma db seed && cd ../..`
Expected: exit 0, ending with `Seed complete: super@platform.test / DevSuper123!, admin@demo-org.test / DevAdmin123! (org slug: demo-org)`.

- [ ] **Step 8: Confirm both apps still build cleanly**

Run: `npm run build --workspace=apps/api`
Expected: exit 0 — the new model exists in the generated Prisma client but nothing references it yet, so this should be a clean, unaffected build.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/prisma/seed.ts
git commit -m "feat: add AiJob schema, RLS, and ai_jobs:view permission"
```

---

### Task 2: Queue/Worker core — Redis connection, Queue, Worker, echo processor, JobsService

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/jobs/redis-connection.ts`
- Create: `apps/api/src/jobs/ai-jobs.queue.ts`
- Create: `apps/api/src/jobs/processors/job-processor.interface.ts`
- Create: `apps/api/src/jobs/processors/echo.processor.ts`
- Create: `apps/api/src/jobs/processors/echo.processor.spec.ts`
- Create: `apps/api/src/jobs/ai-jobs.worker.service.ts`
- Create: `apps/api/src/jobs/jobs.service.ts`
- Create: `apps/api/src/jobs/jobs.service.spec.ts`

**Interfaces:**
- Consumes: `AiJob` model from Task 1. `TenantPrismaService`, `TenantContext` from `@exam-platform/shared`.
- Produces: `REDIS_CONNECTION` (injection token) + `createRedisConnection(): Redis`. `AI_JOBS_QUEUE` (injection token) + `AI_JOBS_QUEUE_NAME = 'ai-jobs'` + `createAiJobsQueue(connection): Queue`. `JobProcessor` interface (`{ type: string; process(input: unknown): Promise<unknown> }`) + `AI_JOB_PROCESSORS` injection token — Task 3's module wiring assembles these into the DI graph; a future job type (5b) implements `JobProcessor` and gets added to the `AI_JOB_PROCESSORS` array. `JobsService.enqueue(context, type, inputJson, userId): Promise<AiJob>` and `JobsService.getById(context, id): Promise<AiJobStatus>` — Task 3's controller calls both.

- [ ] **Step 1: Add the new dependencies**

Modify `apps/api/package.json` — replace the `"dependencies"` object with:

```json
  "dependencies": {
    "@exam-platform/shared": "0.0.1",
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.3.0",
    "@prisma/client": "^5.10.0",
    "argon2": "^0.31.2",
    "bullmq": "^5.34.0",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.6",
    "csv-parse": "^7.0.1",
    "csv-stringify": "^6.5.1",
    "exceljs": "^4.4.0",
    "ioredis": "^5.4.1",
    "multer": "^1.4.5-lts.1",
    "nodemailer": "^9.0.3",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "pdfkit": "^0.15.0",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1",
    "uuid": "^9.0.1"
  },
```

(`devDependencies` is unchanged — both `bullmq` and `ioredis` ship their own TypeScript types, no `@types/*` package needed.)

Run: `npm install --workspace=apps/api`
Expected: exit 0, `apps/api/node_modules/bullmq` and `ioredis` present.

- [ ] **Step 2: Write the failing unit tests**

Create `apps/api/src/jobs/processors/echo.processor.spec.ts`:

```typescript
import { EchoProcessor } from './echo.processor';

describe('EchoProcessor', () => {
  it('returns the input wrapped in an echoed field', async () => {
    const processor = new EchoProcessor();

    const result = await processor.process({ message: 'hello' });

    expect(result).toEqual({ echoed: { message: 'hello' } });
  });
});
```

Create `apps/api/src/jobs/jobs.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { AI_JOBS_QUEUE } from './ai-jobs.queue';

describe('JobsService', () => {
  let service: JobsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let queue: { add: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    queue = { add: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        JobsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AI_JOBS_QUEUE, useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(JobsService);
  });

  describe('enqueue', () => {
    it('creates an AiJob row and pushes a matching job onto the queue with no retries', async () => {
      const tx = {
        aiJob: { create: jest.fn().mockResolvedValue({ id: 'job-1', type: 'echo', inputJson: '{"a":1}' }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.enqueue(context, 'echo', '{"a":1}', 'user-1');

      expect(result).toEqual({ id: 'job-1', type: 'echo', inputJson: '{"a":1}' });
      expect(tx.aiJob.create).toHaveBeenCalledWith({
        data: { organizationId: 'org-1', type: 'echo', inputJson: '{"a":1}', createdBy: 'user-1' },
      });
      expect(queue.add).toHaveBeenCalledWith(
        'echo',
        { aiJobId: 'job-1', organizationId: 'org-1', type: 'echo' },
        { attempts: 1 },
      );
    });
  });

  describe('getById', () => {
    it("returns the job status when it exists in the caller's organization", async () => {
      const tx = {
        aiJob: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'job-1', type: 'echo', status: 'completed', outputJson: '{"echoed":1}', error: null,
            createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:05Z'),
          }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getById(context, 'job-1');

      expect(result).toEqual({
        id: 'job-1', type: 'echo', status: 'completed', outputJson: '{"echoed":1}', error: null,
        createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:05Z'),
      });
      expect(tx.aiJob.findFirst).toHaveBeenCalledWith({ where: { id: 'job-1', organizationId: 'org-1' } });
    });

    it('throws NotFoundException when the job does not exist in the org', async () => {
      const tx = { aiJob: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getById(context, 'job-999')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:api -- jobs`
Expected: FAIL — `Cannot find module './echo.processor'` and `Cannot find module './jobs.service'`

- [ ] **Step 4: Write the Redis connection, Queue, and processor interface**

Create `apps/api/src/jobs/redis-connection.ts`:

```typescript
import Redis from 'ioredis';

export const REDIS_CONNECTION = 'REDIS_CONNECTION';

export function createRedisConnection(): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  // BullMQ's blocking commands require maxRetriesPerRequest: null on the underlying
  // ioredis connection -- without it, BullMQ throws at startup.
  return new Redis(url, { maxRetriesPerRequest: null });
}
```

Create `apps/api/src/jobs/ai-jobs.queue.ts`:

```typescript
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const AI_JOBS_QUEUE = 'AI_JOBS_QUEUE';
export const AI_JOBS_QUEUE_NAME = 'ai-jobs';

export function createAiJobsQueue(connection: Redis): Queue {
  return new Queue(AI_JOBS_QUEUE_NAME, { connection });
}
```

Create `apps/api/src/jobs/processors/job-processor.interface.ts`:

```typescript
export interface JobProcessor {
  readonly type: string;
  process(input: unknown): Promise<unknown>;
}

export const AI_JOB_PROCESSORS = 'AI_JOB_PROCESSORS';
```

Create `apps/api/src/jobs/processors/echo.processor.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { JobProcessor } from './job-processor.interface';

@Injectable()
export class EchoProcessor implements JobProcessor {
  readonly type = 'echo';

  async process(input: unknown): Promise<unknown> {
    return { echoed: input };
  }
}
```

- [ ] **Step 5: Write the Worker service**

Create `apps/api/src/jobs/ai-jobs.worker.service.ts`:

```typescript
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
import { TenantPrismaService } from '@exam-platform/shared';
import { REDIS_CONNECTION } from './redis-connection';
import { AI_JOBS_QUEUE, AI_JOBS_QUEUE_NAME } from './ai-jobs.queue';
import { AI_JOB_PROCESSORS, JobProcessor } from './processors/job-processor.interface';

interface AiJobPayload {
  aiJobId: string;
  organizationId: string;
  type: string;
}

@Injectable()
export class AiJobsWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(AiJobsWorkerService.name);
  private readonly worker: Worker;
  private readonly processorsByType: Map<string, JobProcessor>;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    @Inject(AI_JOBS_QUEUE) private readonly queue: Queue,
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(AI_JOB_PROCESSORS) processors: JobProcessor[],
  ) {
    this.processorsByType = new Map(processors.map((processor) => [processor.type, processor]));
    this.worker = new Worker(AI_JOBS_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
  }

  private async handle(job: Job<AiJobPayload>): Promise<unknown> {
    const { aiJobId, organizationId, type } = job.data;
    const context = { organizationId, isSuperAdmin: false };

    const aiJob = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiJob.update({ where: { id: aiJobId }, data: { status: 'processing' } }),
    );

    const processor = this.processorsByType.get(type);
    if (!processor) {
      const error = `No processor registered for job type "${type}"`;
      this.logger.error(error);
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.aiJob.update({ where: { id: aiJobId }, data: { status: 'failed', error } }),
      );
      throw new Error(error);
    }

    try {
      const output = await processor.process(JSON.parse(aiJob.inputJson));
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.aiJob.update({
          where: { id: aiJobId },
          data: { status: 'completed', outputJson: JSON.stringify(output) },
        }),
      );
      return output;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`AI job ${aiJobId} (type "${type}") failed: ${message}`);
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.aiJob.update({ where: { id: aiJobId }, data: { status: 'failed', error: message } }),
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
    await this.queue.close();
    await this.connection.quit();
  }
}
```

- [ ] **Step 6: Write the JobsService**

Create `apps/api/src/jobs/jobs.service.ts`:

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AiJob } from '@prisma/client';
import { Queue } from 'bullmq';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AI_JOBS_QUEUE } from './ai-jobs.queue';

export interface AiJobStatus {
  id: string;
  type: string;
  status: string;
  outputJson: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(AI_JOBS_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(context: TenantContext, type: string, inputJson: string, userId: string): Promise<AiJob> {
    const aiJob = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiJob.create({
        data: {
          organizationId: context.organizationId as string,
          type,
          inputJson,
          createdBy: userId,
        },
      }),
    );

    await this.queue.add(
      type,
      { aiJobId: aiJob.id, organizationId: context.organizationId as string, type },
      { attempts: 1 },
    );

    return aiJob;
  }

  async getById(context: TenantContext, id: string): Promise<AiJobStatus> {
    const aiJob = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiJob.findFirst({ where: { id, organizationId: context.organizationId as string } }),
    );
    if (!aiJob) {
      throw new NotFoundException(`AI job ${id} not found`);
    }
    return {
      id: aiJob.id,
      type: aiJob.type,
      status: aiJob.status,
      outputJson: aiJob.outputJson,
      error: aiJob.error,
      createdAt: aiJob.createdAt,
      updatedAt: aiJob.updatedAt,
    };
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm run test:api -- jobs`
Expected: `Tests: 4 passed, 4 total`

- [ ] **Step 8: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/jobs
git commit -m "feat: add BullMQ queue/worker core, echo processor, and JobsService"
```

---

### Task 3: HTTP surface + full wiring + dev infra

**Files:**
- Create: `apps/api/src/jobs/jobs.controller.ts`
- Create: `apps/api/src/jobs/jobs.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `README.md`
- Create: `apps/api/test/ai-jobs.e2e-spec.ts`

**Interfaces:**
- Consumes: `JobsService` from Task 2 (same signature — `enqueue`/`getById`). `REDIS_CONNECTION`, `AI_JOBS_QUEUE`, `AI_JOB_PROCESSORS`, `EchoProcessor`, `AiJobsWorkerService` from Task 2.
- Produces: `GET /api/v1/ai-jobs/:id` (public route), `JobsModule` (importable, exports `JobsService` for a future feature module like 5b's question-generation module to consume).

- [ ] **Step 1: Start Redis for local development**

Create `docker-compose.yml` at the repo root:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
```

Run: `docker compose up -d`
Expected: the `redis` container starts, listening on `localhost:6379`. This must be running before Step 6's e2e test — and before running ANY `apps/api` e2e test from this point forward, including every pre-existing file, since `JobsModule` now loads on every `apps/api` boot (see Global Constraints).

- [ ] **Step 2: Document Redis in `.env.example` and README**

Modify `.env.example` — add this line (after `INTERNAL_SERVICE_SECRET`):

```
REDIS_URL="redis://localhost:6379"
```

Modify `README.md` — add this line to the "Phase 0: local development setup" numbered list, as a new step 1a right after the existing SQL Server step:

```markdown
1a. Get Redis reachable at `localhost:6379` — `docker compose up -d` starts it (this repo's `docker-compose.yml`, added in Phase 5a). Required for `apps/api` to boot at all (it runs an in-process BullMQ worker) and for its e2e suite to run, not just for AI-job-specific features.
```

- [ ] **Step 3: Write the controller and module**

Create `apps/api/src/jobs/jobs.controller.ts`:

```typescript
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { JobsService } from './jobs.service';

@Controller('ai-jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':id')
  @RequirePermissions('ai_jobs:view')
  getById(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.jobsService.getById(tenant, id);
  }
}
```

Create `apps/api/src/jobs/jobs.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { REDIS_CONNECTION, createRedisConnection } from './redis-connection';
import { AI_JOBS_QUEUE, createAiJobsQueue } from './ai-jobs.queue';
import { AI_JOB_PROCESSORS } from './processors/job-processor.interface';
import { EchoProcessor } from './processors/echo.processor';
import { AiJobsWorkerService } from './ai-jobs.worker.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [JobsController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: AI_JOBS_QUEUE, useFactory: createAiJobsQueue, inject: [REDIS_CONNECTION] },
    EchoProcessor,
    { provide: AI_JOB_PROCESSORS, useFactory: (echo: EchoProcessor) => [echo], inject: [EchoProcessor] },
    AiJobsWorkerService,
    JobsService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
```

- [ ] **Step 4: Register the module in `AppModule`**

Modify `apps/api/src/app.module.ts`:

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
import { ReportsModule } from './reports/reports.module';
import { JobsModule } from './jobs/jobs.module';

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
    ReportsModule,
    JobsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Confirm the app still boots and builds with Redis running**

Run: `npm run build --workspace=apps/api`
Expected: exit 0, no TypeScript errors.

Run: `npm run dev:api` briefly (with Redis running from Step 1), confirm it starts without throwing, then stop it (Ctrl+C).
Expected: no Redis-connection errors in the startup log.

- [ ] **Step 6: Write the failing e2e test**

Create `apps/api/test/ai-jobs.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { JobsService } from '../src/jobs/jobs.service';

describe('AI Jobs HTTP flow', () => {
  let adminApp: INestApplication;
  let adminHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let jobsService: JobsService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;

  beforeAll(async () => {
    adminApp = await bootAdminApp();
    adminHttp = adminApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    jobsService = adminApp.get(JobsService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-jobs-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Jobs Org', slug: `ci-ai-jobs-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-jobs.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-ai-jobs.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-jobs.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-ai-jobs.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.aiJob.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
  });

  it('processes an echo job end-to-end: enqueue -> worker completes it -> pollable via HTTP', async () => {
    const context = { organizationId: orgId, isSuperAdmin: false };
    const enqueued = await jobsService.enqueue(context, 'echo', JSON.stringify({ message: 'hello' }), randomUUID());

    let statusBody: { status: string; outputJson: string | null } = { status: 'pending', outputJson: null };
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const statusResponse = await request(adminHttp)
        .get(`/api/v1/ai-jobs/${enqueued.id}`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .expect(200);
      statusBody = statusResponse.body;
      if (statusBody.status === 'completed' || statusBody.status === 'failed') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    expect(statusBody.status).toBe('completed');
    expect(JSON.parse(statusBody.outputJson as string)).toEqual({ echoed: { message: 'hello' } });
  });

  it('returns 404 for a job belonging to a different organization', async () => {
    const otherPlan = await prisma.plan.create({
      data: { name: `ci-ai-jobs-other-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    const otherOrg = await prisma.organization.create({
      data: { name: 'CI AI Jobs Other Org', slug: `ci-ai-jobs-other-org-${randomUUID()}`, planId: otherPlan.id },
    });
    const otherContext = { organizationId: otherOrg.id, isSuperAdmin: false };
    const otherJob = await jobsService.enqueue(otherContext, 'echo', JSON.stringify({ message: 'other' }), randomUUID());

    await request(adminHttp)
      .get(`/api/v1/ai-jobs/${otherJob.id}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);

    await tenantPrisma.forTenant(otherContext, (tx) => tx.aiJob.deleteMany({ where: { organizationId: otherOrg.id } }));
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: otherPlan.id } }).catch(() => undefined);
  });

  it('rejects a role without ai_jobs:view from polling job status', async () => {
    const context = { organizationId: orgId, isSuperAdmin: false };
    const job = await jobsService.enqueue(context, 'echo', JSON.stringify({ message: 'perm-check' }), randomUUID());

    await request(adminHttp)
      .get(`/api/v1/ai-jobs/${job.id}`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Ensure Redis is running (Step 1). Run: `npm run test:api:e2e -- ai-jobs`
Expected: `Tests: 3 passed, 3 total`. The first test's poll loop should resolve within a second or two in practice — the `echo` processor does no real work.

- [ ] **Step 8: Run the full existing e2e suite to confirm nothing else broke**

Run: `npm run test:api:e2e -- --runInBand`
Expected: all suites pass, including every pre-existing file — this is the concrete proof that adding `JobsModule` to `AppModule` (and therefore a live Redis dependency) didn't break any existing test's app-boot or its `afterAll` teardown (no lingering open Redis handles causing Jest to hang).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/jobs apps/api/src/app.module.ts apps/api/test/ai-jobs.e2e-spec.ts docker-compose.yml .env.example README.md
git commit -m "feat: add ai-jobs HTTP endpoint, wire JobsModule into AppModule, add local Redis"
```

---

### Task 4: Final verification

**Files:** None — verification only, no code changes expected.

**Interfaces:** N/A.

- [ ] **Step 1: Confirm Redis is running**

Run: `docker compose ps`
Expected: the `redis` service is `Up`. If not, run `docker compose up -d` first — every step below depends on it.

- [ ] **Step 2: Run the full unit suites**

Run: `npm run test:api`
Expected: all suites pass, including the 2 new `jobs`-related spec files from Task 2.

Run: `npm run test:exam-runtime`
Expected: unchanged from the pre-Phase-5a baseline — this phase makes zero changes to `apps/exam-runtime`.

- [ ] **Step 3: Run the full e2e suite serially**

Run: `npm run test:api:e2e -- --runInBand`
Expected: all suites pass, including the new `ai-jobs.e2e-spec.ts` (3 tests). If the standing pre-existing parallel-worker DB-contention flake appears in a non-serial run, re-confirm via `git stash`/A-B comparison against the pre-Phase-5a baseline, exactly as every prior phase's Task 4 has done — this phase's own change (a new module + new dependency) is a different class of risk (Redis connectivity, not DB contention) and should be diagnosed on its own terms if something fails, not folded into the existing DB-flake explanation without checking.

- [ ] **Step 4: Build both apps**

Run: `npm run build --workspace=apps/api`
Expected: exit 0, no TypeScript errors, including clean compilation of the new `bullmq`/`ioredis` type imports.

Run: `npm run build --workspace=apps/exam-runtime`
Expected: exit 0 — unaffected by this phase, confirms no accidental cross-app breakage.

- [ ] **Step 5: Confirm no migration drift**

Run: `npx prisma migrate status --schema=apps/api/prisma/schema.prisma`
Expected: "Database schema is up to date!" — both of this phase's migrations (schema + RLS) should be listed as applied.

- [ ] **Step 6: Confirm the seed permission persisted**

Run this ad hoc script and inspect the output:
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.rolePermission.findMany({ where: { permission: { key: 'ai_jobs:view' } }, include: { permission: true } })
  .then((rows) => { console.log(rows.map((r) => r.role)); return prisma.\$disconnect(); });
"
```
Expected output: `[ 'recruiter' ]`.

- [ ] **Step 7: Dead-reference sweep**

Run: `grep -rn "AiJobsWorkerService\|JobsController\|JobsService\|JobsModule" apps/api/src/app.module.ts apps/api/src/jobs`
Expected: `JobsModule` appears in `app.module.ts`'s imports; `JobsController`/`JobsService`/`AiJobsWorkerService` are only referenced within `apps/api/src/jobs/` itself (module wiring) — no stray references elsewhere.

- [ ] **Step 8: Confirm graceful shutdown (no lingering Redis connections)**

Run: `npm run test:api:e2e -- --runInBand --detectOpenHandles 2>&1 | grep -i redis`
Expected: no output — `--detectOpenHandles` would report any Redis socket Jest thinks is still open after all tests finish; a clean run producing no Redis-related matches confirms `AiJobsWorkerService.onModuleDestroy()` is genuinely closing the Worker, Queue, and shared connection on every e2e file's `app.close()`.
