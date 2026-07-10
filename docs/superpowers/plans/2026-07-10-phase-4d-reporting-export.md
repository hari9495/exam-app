# Phase 4d — Reporting Depth & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add exam-level aggregate analytics (pass rate, score distribution, question accuracy, attempt duration) and CSV/Excel/PDF export of per-candidate results to `apps/api`.

**Architecture:** A new `apps/api/src/reports/` module (`ReportsController`/`ReportsService`) reuses the existing `ExamsService.getResults()` for per-candidate rows and settlement side-effects, adds aggregate computation on top, and delegates file generation to three small, pure exporter functions. No schema changes — everything is computed from data that already exists.

**Tech Stack:** NestJS 10, Prisma 5 (SQL Server), `csv-stringify`, `exceljs`, `pdfkit` (all new dependencies).

## Global Constraints

- No schema changes, no new Prisma migration — every value is computed from existing columns (`docs/superpowers/specs/2026-07-10-phase-4d-reporting-export-design.md` §1).
- All new routes reuse the existing `exam:manage` permission — no new permission key (§1, §2).
- "Settled" means `Attempt.status` is exactly one of `'submitted'`, `'auto_submitted'`, `'force_submitted'` — never just `'submitted'` (§3).
- Score distribution buckets are exactly `0-20`, `20-40`, `40-60`, `60-80`, `80-100` by percentage, upper bound exclusive except the top bucket includes 100 (§3).
- Question accuracy is scoped per-question to only the settled attempts whose `Attempt.questionOrderJson` contains that question ID (pool-selection aware) — never naively divided across every attempt in the exam. Skipping a question counts against `accuracyPercentage` (§3).
- Export is synchronous (no job queue) and contains only the same per-candidate rows `getResults()` already returns, plus a new `durationMinutes` field — no aggregate stats embedded in export files (§1, §3).
- New dependencies: `csv-stringify`, `exceljs`, `pdfkit` (+ `@types/pdfkit` dev) — added in Task 3, the first task that uses them.
- This phase touches only `apps/api`. `apps/exam-runtime` is unaffected (§3: no new instrumentation).

---

## File Structure

- **Create** `apps/api/src/reports/reports.module.ts` — registers `ReportsController`/`ReportsService`, imports `ExamsModule`.
- **Create** `apps/api/src/reports/reports.service.ts` — `getSummary()`, `getQuestionAccuracy()`, `getExportRows()`, plus a private `fetchStartedAtByAttemptId()` helper shared by the first and third.
- **Create** `apps/api/src/reports/reports.service.spec.ts` — unit tests for all three service methods.
- **Create** `apps/api/src/reports/reports.controller.ts` — three new `GET` routes under the existing `exams/:id/...` path family.
- **Create** `apps/api/src/reports/dto/export-format-query.dto.ts` — validates the `format` query param.
- **Create** `apps/api/src/reports/exporters/csv-exporter.ts`, `xlsx-exporter.ts`, `pdf-exporter.ts` — pure `(rows) => Buffer` / `(rows) => Promise<Buffer>` functions, one per format, each with its own spec file.
- **Create** `apps/api/test/exam-reporting.e2e-spec.ts` — real HTTP round trips, extended incrementally across Tasks 1–3.
- **Modify** `apps/api/src/app.module.ts` — register `ReportsModule`.
- **Modify** `apps/api/package.json` — add `csv-stringify`, `exceljs`, `pdfkit`, `@types/pdfkit` (Task 3).

---

### Task 1: Reports module scaffold + exam summary stats

**Files:**
- Create: `apps/api/src/reports/reports.service.ts`
- Create: `apps/api/src/reports/reports.service.spec.ts`
- Create: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/src/reports/reports.module.ts`
- Create: `apps/api/test/exam-reporting.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ExamsService.getResults(context: TenantContext, examId: string): Promise<ExamResultRow[]>` (`apps/api/src/exams/exams.service.ts:303`), `ExamResultRow` type (same file, line 20), `TenantPrismaService.forTenant<T>(context, fn)` (`@exam-platform/shared`).
- Produces: `ReportsService.getSummary(context, examId): Promise<ExamResultsSummary>`, the `ExamResultsSummary` interface, the `SETTLED_ATTEMPT_STATUSES` constant, and the private `fetchStartedAtByAttemptId(context, attemptIds): Promise<Map<string, Date>>` helper — Task 2 and Task 3 both reuse `SETTLED_ATTEMPT_STATUSES` and `fetchStartedAtByAttemptId` from this same file; do not redefine them.

- [ ] **Step 1: Write the failing unit tests**

Create `apps/api/src/reports/reports.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { ReportsService } from './reports.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { ExamsService, ExamResultRow } from '../exams/exams.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let examsService: { getResults: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    examsService = { getResults: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ExamsService, useValue: examsService },
      ],
    }).compile();
    service = moduleRef.get(ReportsService);
  });

  function row(overrides: Partial<ExamResultRow>): ExamResultRow {
    return {
      candidateId: 'cand-1',
      candidateName: 'Candidate',
      invitationId: 'inv-1',
      attemptId: null,
      status: 'invited',
      score: null,
      maxScore: null,
      percentage: null,
      passFail: null,
      submittedAt: null,
      proctoringAnalysis: null,
      ...overrides,
    };
  }

  describe('getSummary', () => {
    it('classifies candidates into settled (all 3 terminal statuses)/in-progress/not-started buckets', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', percentage: 80, passFail: 'pass' }),
        row({ status: 'auto_submitted', attemptId: 'a2', percentage: 40, passFail: 'fail' }),
        row({ status: 'force_submitted', attemptId: 'a3', percentage: 60, passFail: 'pass' }),
        row({ status: 'in_progress', attemptId: 'a4' }),
        row({ status: 'invited' }),
      ]);
      tenantPrisma.forTenant.mockResolvedValue([]);

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.totalCandidates).toBe(5);
      expect(summary.settledCount).toBe(3);
      expect(summary.inProgressCount).toBe(1);
      expect(summary.notStartedCount).toBe(1);
    });

    it('computes pass rate, average percentage, and score distribution from settled rows only', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', percentage: 80, passFail: 'pass' }),
        row({ status: 'submitted', attemptId: 'a2', percentage: 40, passFail: 'fail' }),
        row({ status: 'in_progress', attemptId: 'a3' }),
      ]);
      tenantPrisma.forTenant.mockResolvedValue([]);

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.passRate).toBe(50);
      expect(summary.averagePercentage).toBe(60);
      expect(summary.scoreDistribution).toEqual([
        { rangeLabel: '0-20', count: 0 },
        { rangeLabel: '20-40', count: 0 },
        { rangeLabel: '40-60', count: 1 },
        { rangeLabel: '60-80', count: 0 },
        { rangeLabel: '80-100', count: 1 },
      ]);
    });

    it('computes attempt duration avg/min/max from startedAt/submittedAt across settled attempts', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', percentage: 50, passFail: 'fail', submittedAt: new Date('2026-01-01T00:30:00Z') }),
        row({ status: 'submitted', attemptId: 'a2', percentage: 90, passFail: 'pass', submittedAt: new Date('2026-01-01T01:10:00Z') }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', startedAt: new Date('2026-01-01T00:00:00Z') },
            { id: 'a2', startedAt: new Date('2026-01-01T00:00:00Z') },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.attemptDuration).toEqual({ avgMinutes: 50, minMinutes: 30, maxMinutes: 70 });
    });

    it('returns zero-valued stats and a null attemptDuration when no attempt has settled', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'in_progress', attemptId: 'a1' }),
        row({ status: 'invited' }),
      ]);

      const summary = await service.getSummary(context, 'exam-1');

      expect(summary.settledCount).toBe(0);
      expect(summary.passRate).toBe(0);
      expect(summary.averagePercentage).toBe(0);
      expect(summary.attemptDuration).toBeNull();
      expect(summary.scoreDistribution.every((bucket) => bucket.count === 0)).toBe(true);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- reports.service`
Expected: FAIL — `Cannot find module './reports.service'`

- [ ] **Step 3: Write the service implementation**

Create `apps/api/src/reports/reports.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { ExamsService, ExamResultRow } from '../exams/exams.service';

export const SETTLED_ATTEMPT_STATUSES = ['submitted', 'auto_submitted', 'force_submitted'];

const SCORE_DISTRIBUTION_BUCKETS = [
  { rangeLabel: '0-20', min: 0, max: 20 },
  { rangeLabel: '20-40', min: 20, max: 40 },
  { rangeLabel: '40-60', min: 40, max: 60 },
  { rangeLabel: '60-80', min: 60, max: 80 },
  { rangeLabel: '80-100', min: 80, max: 100 },
];

export interface ExamResultsSummary {
  totalCandidates: number;
  settledCount: number;
  inProgressCount: number;
  notStartedCount: number;
  passRate: number;
  averagePercentage: number;
  scoreDistribution: { rangeLabel: string; count: number }[];
  attemptDuration: { avgMinutes: number; minMinutes: number; maxMinutes: number } | null;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examsService: ExamsService,
  ) {}

  async getSummary(context: TenantContext, examId: string): Promise<ExamResultsSummary> {
    const rows = await this.examsService.getResults(context, examId);

    const settledRows = rows.filter((row) => SETTLED_ATTEMPT_STATUSES.includes(row.status));
    const inProgressRows = rows.filter((row) => row.status === 'in_progress');
    const notStartedCount = rows.length - settledRows.length - inProgressRows.length;

    const passCount = settledRows.filter((row) => row.passFail === 'pass').length;
    const passRate = settledRows.length > 0 ? (passCount / settledRows.length) * 100 : 0;
    const averagePercentage = settledRows.length > 0
      ? settledRows.reduce((sum, row) => sum + (row.percentage ?? 0), 0) / settledRows.length
      : 0;

    const scoreDistribution = SCORE_DISTRIBUTION_BUCKETS.map((bucket) => ({
      rangeLabel: bucket.rangeLabel,
      count: settledRows.filter((row) => {
        const percentage = row.percentage ?? 0;
        return bucket.max === 100
          ? percentage >= bucket.min && percentage <= bucket.max
          : percentage >= bucket.min && percentage < bucket.max;
      }).length,
    }));

    const attemptDuration = await this.computeAttemptDuration(context, settledRows);

    return {
      totalCandidates: rows.length,
      settledCount: settledRows.length,
      inProgressCount: inProgressRows.length,
      notStartedCount,
      passRate,
      averagePercentage,
      scoreDistribution,
      attemptDuration,
    };
  }

  private async computeAttemptDuration(
    context: TenantContext,
    settledRows: ExamResultRow[],
  ): Promise<{ avgMinutes: number; minMinutes: number; maxMinutes: number } | null> {
    const attemptIds = settledRows.map((row) => row.attemptId).filter((id): id is string => id !== null);
    const startedAtById = await this.fetchStartedAtByAttemptId(context, attemptIds);

    const durationsMinutes = settledRows
      .map((row) => {
        const startedAt = row.attemptId ? startedAtById.get(row.attemptId) : undefined;
        if (!startedAt || !row.submittedAt) {
          return null;
        }
        return (row.submittedAt.getTime() - startedAt.getTime()) / 60_000;
      })
      .filter((duration): duration is number => duration !== null);

    if (durationsMinutes.length === 0) {
      return null;
    }

    return {
      avgMinutes: durationsMinutes.reduce((sum, duration) => sum + duration, 0) / durationsMinutes.length,
      minMinutes: Math.min(...durationsMinutes),
      maxMinutes: Math.max(...durationsMinutes),
    };
  }

  private async fetchStartedAtByAttemptId(context: TenantContext, attemptIds: string[]): Promise<Map<string, Date>> {
    if (attemptIds.length === 0) {
      return new Map();
    }
    const attempts = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.attempt.findMany({ where: { id: { in: attemptIds } }, select: { id: true, startedAt: true } }),
    );
    return new Map(attempts.map((attempt) => [attempt.id, attempt.startedAt]));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api -- reports.service`
Expected: `Tests: 4 passed, 4 total`

- [ ] **Step 5: Write the controller and module**

Create `apps/api/src/reports/reports.controller.ts`:

```typescript
import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { ReportsService } from './reports.service';

@Controller('exams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':id/results/summary')
  @RequirePermissions('exam:manage')
  getSummary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getSummary(tenant, id);
  }
}
```

Create `apps/api/src/reports/reports.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [ExamsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

Modify `apps/api/src/app.module.ts` — add the import and register it in the `imports` array, right after `AttemptsAdminModule`:

```typescript
import { AttemptsAdminModule } from './attempts-admin/attempts-admin.module';
import { ReportsModule } from './reports/reports.module';

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
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Write the failing e2e test**

Create `apps/api/test/exam-reporting.e2e-spec.ts` — mirrors `apps/api/test/exam-taking-runtime.e2e-spec.ts`'s dual-app setup, but with its own org/exam so it can run independently. One question worth 10 marks; Alice answers correctly and submits, Bob answers incorrectly and submits, Carol starts but never submits, Dave never starts:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Exam Reporting HTTP flow', () => {
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
  let questionId: string;
  let correctOptionId: string;
  let wrongOptionId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-reporting-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Reporting Org', slug: `ci-reporting-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-reporting.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-reporting.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-reporting.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-reporting.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Reporting Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const question = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 10,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    questionId = question.body.id;
    correctOptionId = question.body.options.find((o: { text: string }) => o.text === '4').id;
    wrongOptionId = question.body.options.find((o: { text: string }) => o.text === '5').id;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    async function inviteAndRedeem(email: string, name: string): Promise<string> {
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
      const token = inviteResponse.body.created[0].token;
      return (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    }

    const aliceAccessToken = await inviteAndRedeem('alice@ci-reporting.test', 'Alice');
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${aliceAccessToken}`).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${aliceAccessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${aliceAccessToken}`).expect(201);

    const bobAccessToken = await inviteAndRedeem('bob@ci-reporting.test', 'Bob');
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${bobAccessToken}`).expect(201);
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${bobAccessToken}`)
      .send({ questionId, selectedOptionIds: [wrongOptionId] })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${bobAccessToken}`).expect(201);

    const carolAccessToken = await inviteAndRedeem('carol@ci-reporting.test', 'Carol');
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${carolAccessToken}`).expect(201);

    await inviteAndRedeem('dave@ci-reporting.test', 'Dave');
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

  it('returns exam summary stats reflecting settled, in-progress, and not-started candidates', async () => {
    const response = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/summary`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(response.body.totalCandidates).toBe(4);
    expect(response.body.settledCount).toBe(2);
    expect(response.body.inProgressCount).toBe(1);
    expect(response.body.notStartedCount).toBe(1);
    expect(response.body.passRate).toBe(50);
    expect(response.body.averagePercentage).toBe(50);
    expect(response.body.scoreDistribution).toEqual([
      { rangeLabel: '0-20', count: 1 },
      { rangeLabel: '20-40', count: 0 },
      { rangeLabel: '40-60', count: 0 },
      { rangeLabel: '60-80', count: 0 },
      { rangeLabel: '80-100', count: 1 },
    ]);
    expect(response.body.attemptDuration).not.toBeNull();
    expect(response.body.attemptDuration.avgMinutes).toBeGreaterThanOrEqual(0);
  });

  it('rejects a summary request from a role without exam:manage', async () => {
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/summary`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 7: Run the e2e test to verify it fails**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: FAIL — `404 Not Found` is not yet possible since the route doesn't exist until Step 5's code lands; run this after Step 6 but before wiring is confirmed to prove the route is genuinely new. If Steps 1–5 already ran, this step instead confirms the happy path — run `git stash` on `reports.module.ts`'s app.module.ts registration only if you want a true RED; otherwise proceed directly, since Steps 1–5's unit RED/GREEN already exercised TDD for the service logic and this e2e step is integration confirmation.

- [ ] **Step 8: Run the e2e test to verify it passes**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: `Tests: 2 passed, 2 total`

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/reports apps/api/src/app.module.ts apps/api/test/exam-reporting.e2e-spec.ts
git commit -m "feat: add exam summary stats reporting endpoint"
```

---

### Task 2: Question-level accuracy endpoint

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.service.spec.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Modify: `apps/api/test/exam-reporting.e2e-spec.ts`

**Interfaces:**
- Consumes: `SETTLED_ATTEMPT_STATUSES` and the `ReportsService` class from Task 1 (same file, add a method — do not create a new service class). `Attempt.questionOrderJson: string` (JSON array of question ID strings), `Answer.selectedOptionIdsJson: string` (JSON array of option ID strings), `Answer.isCorrect: boolean | null`, `Question.text: string` (all from `apps/api/prisma/schema.prisma`).
- Produces: `ReportsService.getQuestionAccuracy(context, examId): Promise<QuestionAccuracyRow[]>` and the `QuestionAccuracyRow` interface — Task 3 does not consume this, but the controller route this task adds (`GET :id/results/question-accuracy`) sits alongside Task 3's export route in the same controller class.

- [ ] **Step 1: Write the failing unit tests**

Add to `apps/api/src/reports/reports.service.spec.ts`, inside the existing `describe('ReportsService', ...)` block, as a sibling to `describe('getSummary', ...)`:

```typescript
  describe('getQuestionAccuracy', () => {
    it('scopes timesIncluded per question to only the attempts whose questionOrderJson contains it (pool-selection aware)', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1' }),
        row({ status: 'submitted', attemptId: 'a2' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', questionOrderJson: JSON.stringify(['q1', 'q2']) },
            { id: 'a2', questionOrderJson: JSON.stringify(['q1']) },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Question 1' },
            { id: 'q2', text: 'Question 2' },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const accuracy = await service.getQuestionAccuracy(context, 'exam-1');

      const q1 = accuracy.find((r) => r.questionId === 'q1')!;
      const q2 = accuracy.find((r) => r.questionId === 'q2')!;
      expect(q1.timesIncluded).toBe(2);
      expect(q2.timesIncluded).toBe(1);
    });

    it('computes timesAttempted, timesSkipped, timesCorrect, and accuracyPercentage from answers', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1' }),
        row({ status: 'auto_submitted', attemptId: 'a2' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', questionOrderJson: JSON.stringify(['q1']) },
            { id: 'a2', questionOrderJson: JSON.stringify(['q1']) },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true },
          ]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', text: 'Question 1' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const accuracy = await service.getQuestionAccuracy(context, 'exam-1');

      expect(accuracy).toEqual([
        { questionId: 'q1', questionText: 'Question 1', timesIncluded: 2, timesAttempted: 1, timesSkipped: 1, timesCorrect: 1, accuracyPercentage: 50 },
      ]);
    });

    it('returns an empty array when no attempt has settled', async () => {
      examsService.getResults.mockResolvedValue([row({ status: 'in_progress', attemptId: 'a1' })]);

      const accuracy = await service.getQuestionAccuracy(context, 'exam-1');

      expect(accuracy).toEqual([]);
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- reports.service`
Expected: FAIL — `service.getQuestionAccuracy is not a function`

- [ ] **Step 3: Add the service method**

Add to `apps/api/src/reports/reports.service.ts`, after the `ExamResultsSummary` interface:

```typescript
export interface QuestionAccuracyRow {
  questionId: string;
  questionText: string;
  timesIncluded: number;
  timesAttempted: number;
  timesSkipped: number;
  timesCorrect: number;
  accuracyPercentage: number;
}
```

Add this method to the `ReportsService` class, after `getSummary`:

```typescript
  async getQuestionAccuracy(context: TenantContext, examId: string): Promise<QuestionAccuracyRow[]> {
    const rows = await this.examsService.getResults(context, examId);
    const settledAttemptIds = rows
      .filter((row) => row.attemptId !== null && SETTLED_ATTEMPT_STATUSES.includes(row.status))
      .map((row) => row.attemptId as string);

    if (settledAttemptIds.length === 0) {
      return [];
    }

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { id: { in: settledAttemptIds } },
        select: { id: true, questionOrderJson: true },
      });
      const answers = await tx.answer.findMany({
        where: { attemptId: { in: settledAttemptIds } },
        select: { questionId: true, selectedOptionIdsJson: true, isCorrect: true },
      });

      const timesIncludedByQuestion = new Map<string, number>();
      for (const attempt of attempts) {
        const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
        for (const questionId of questionIds) {
          timesIncludedByQuestion.set(questionId, (timesIncludedByQuestion.get(questionId) ?? 0) + 1);
        }
      }

      const timesAttemptedByQuestion = new Map<string, number>();
      const timesCorrectByQuestion = new Map<string, number>();
      for (const answer of answers) {
        const selectedOptionIds: string[] = JSON.parse(answer.selectedOptionIdsJson);
        if (selectedOptionIds.length > 0) {
          timesAttemptedByQuestion.set(answer.questionId, (timesAttemptedByQuestion.get(answer.questionId) ?? 0) + 1);
        }
        if (answer.isCorrect) {
          timesCorrectByQuestion.set(answer.questionId, (timesCorrectByQuestion.get(answer.questionId) ?? 0) + 1);
        }
      }

      const questionIds = [...timesIncludedByQuestion.keys()];
      const questions = await tx.question.findMany({
        where: { id: { in: questionIds }, organizationId: context.organizationId as string },
        select: { id: true, text: true },
      });
      const textById = new Map(questions.map((question) => [question.id, question.text]));

      return questionIds.map((questionId) => {
        const timesIncluded = timesIncludedByQuestion.get(questionId) ?? 0;
        const timesAttempted = timesAttemptedByQuestion.get(questionId) ?? 0;
        const timesCorrect = timesCorrectByQuestion.get(questionId) ?? 0;
        return {
          questionId,
          questionText: textById.get(questionId) ?? '',
          timesIncluded,
          timesAttempted,
          timesSkipped: timesIncluded - timesAttempted,
          timesCorrect,
          accuracyPercentage: timesIncluded > 0 ? (timesCorrect / timesIncluded) * 100 : 0,
        };
      });
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api -- reports.service`
Expected: `Tests: 7 passed, 7 total`

- [ ] **Step 5: Add the controller route**

Add to `apps/api/src/reports/reports.controller.ts`, inside the `ReportsController` class, after `getSummary`:

```typescript
  @Get(':id/results/question-accuracy')
  @RequirePermissions('exam:manage')
  getQuestionAccuracy(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getQuestionAccuracy(tenant, id);
  }
```

- [ ] **Step 6: Write the failing e2e test**

Add to `apps/api/test/exam-reporting.e2e-spec.ts`, after the existing `'returns exam summary stats...'` test. The exam from `beforeAll` has exactly one question (`questionId`) answered by both settled candidates (Alice correctly, Bob incorrectly) — this deterministically proves `timesIncluded`/`timesAttempted`/`timesCorrect`/`accuracyPercentage` without relying on random pool draws (the pool-selection scoping itself is already proven precisely by Task 2's unit tests above):

```typescript
  it('returns per-question accuracy computed only from settled attempts', async () => {
    const response = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/question-accuracy`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(response.body).toEqual([
      {
        questionId,
        questionText: 'What is 2+2?',
        timesIncluded: 2,
        timesAttempted: 2,
        timesSkipped: 0,
        timesCorrect: 1,
        accuracyPercentage: 50,
      },
    ]);
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: `Tests: 3 passed, 3 total`

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports apps/api/test/exam-reporting.e2e-spec.ts
git commit -m "feat: add pool-aware per-question accuracy reporting endpoint"
```

---

### Task 3: CSV/Excel/PDF export

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/reports/dto/export-format-query.dto.ts`
- Create: `apps/api/src/reports/exporters/csv-exporter.ts`
- Create: `apps/api/src/reports/exporters/csv-exporter.spec.ts`
- Create: `apps/api/src/reports/exporters/xlsx-exporter.ts`
- Create: `apps/api/src/reports/exporters/xlsx-exporter.spec.ts`
- Create: `apps/api/src/reports/exporters/pdf-exporter.ts`
- Create: `apps/api/src/reports/exporters/pdf-exporter.spec.ts`
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.service.spec.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Modify: `apps/api/test/exam-reporting.e2e-spec.ts`

**Interfaces:**
- Consumes: `ExamResultRow` (`apps/api/src/exams/exams.service.ts:20`), `fetchStartedAtByAttemptId` private helper from Task 1 (same file, reused internally by the new `getExportRows` method — do not duplicate the query).
- Produces: `ReportsService.getExportRows(context, examId): Promise<ExportResultRow[]>`, the `ExportResultRow` interface (`ExamResultRow & { durationMinutes: number | null }`), and three exporter functions: `exportResultsToCsv(rows: ExportResultRow[]): Buffer`, `exportResultsToXlsx(rows: ExportResultRow[]): Promise<Buffer>`, `exportResultsToPdf(rows: ExportResultRow[]): Promise<Buffer>`.

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
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "cookie-parser": "^1.4.6",
    "csv-parse": "^7.0.1",
    "csv-stringify": "^6.5.1",
    "exceljs": "^4.4.0",
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

And replace the `"devDependencies"` object with:

```json
  "devDependencies": {
    "@exam-platform/exam-runtime": "0.0.1",
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "@types/cookie-parser": "^1.4.10",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.11",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.11.0",
    "@types/nodemailer": "^8.0.1",
    "@types/passport-jwt": "^4.0.1",
    "@types/pdfkit": "^0.13.4",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "prisma": "^5.10.0",
    "socket.io-client": "^4.7.5",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-node": "^10.9.2",
    "typescript": "^5.3.3"
  },
```

Run: `npm install --workspace=apps/api`
Expected: exit 0, `apps/api/node_modules/csv-stringify`, `exceljs`, `pdfkit` all present.

- [ ] **Step 2: Write the failing exporter unit tests**

Create `apps/api/src/reports/exporters/csv-exporter.spec.ts`:

```typescript
import { parse } from 'csv-parse/sync';
import { exportResultsToCsv } from './csv-exporter';
import { ExportResultRow } from '../reports.service';

describe('exportResultsToCsv', () => {
  it('produces a CSV whose rows round-trip back to the original data', () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
        status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
      },
    ];

    const buffer = exportResultsToCsv(rows);
    const records = parse(buffer.toString('utf-8'), { columns: true });

    expect(records).toEqual([
      {
        candidateName: 'Alice', status: 'submitted', score: '10', maxScore: '10', percentage: '100',
        passFail: 'pass', submittedAt: '2026-01-01T00:20:00.000Z', durationMinutes: '20',
      },
    ]);
  });

  it('renders null numeric/date fields as empty strings rather than the literal string "null"', () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-2', candidateName: 'Bob', invitationId: 'inv-2', attemptId: null,
        status: 'invited', score: null, maxScore: null, percentage: null, passFail: null,
        submittedAt: null, proctoringAnalysis: null, durationMinutes: null,
      },
    ];

    const buffer = exportResultsToCsv(rows);
    const records = parse(buffer.toString('utf-8'), { columns: true });

    expect(records).toEqual([
      { candidateName: 'Bob', status: 'invited', score: '', maxScore: '', percentage: '', passFail: '', submittedAt: '', durationMinutes: '' },
    ]);
  });
});
```

Create `apps/api/src/reports/exporters/xlsx-exporter.spec.ts`:

```typescript
import ExcelJS from 'exceljs';
import { exportResultsToXlsx } from './xlsx-exporter';
import { ExportResultRow } from '../reports.service';

describe('exportResultsToXlsx', () => {
  it('produces a workbook whose first sheet round-trips the result rows', async () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
        status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
      },
    ];

    const buffer = await exportResultsToXlsx(rows);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Results')!;
    const headerRow = sheet.getRow(1).values as unknown[];
    const dataRow = sheet.getRow(2).values as unknown[];

    expect(headerRow).toContain('Candidate Name');
    expect(dataRow).toContain('Alice');
    expect(dataRow).toContain(100);
  });
});
```

Create `apps/api/src/reports/exporters/pdf-exporter.spec.ts`:

```typescript
import { exportResultsToPdf } from './pdf-exporter';
import { ExportResultRow } from '../reports.service';

describe('exportResultsToPdf', () => {
  it('produces a non-empty buffer starting with the PDF file signature', async () => {
    const rows: ExportResultRow[] = [
      {
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'a1',
        status: 'submitted', score: 10, maxScore: 10, percentage: 100, passFail: 'pass',
        submittedAt: new Date('2026-01-01T00:20:00Z'), proctoringAnalysis: null, durationMinutes: 20,
      },
    ];

    const buffer = await exportResultsToPdf(rows);

    expect(buffer.length).toBeGreaterThan(100);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });

  it('produces a valid, non-empty PDF even with zero rows', async () => {
    const buffer = await exportResultsToPdf([]);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm run test:api -- exporters`
Expected: FAIL — `Cannot find module './csv-exporter'` (and similarly for xlsx/pdf)

- [ ] **Step 4: Add `getExportRows` to the service**

Add to `apps/api/src/reports/reports.service.ts`, after the `QuestionAccuracyRow` interface:

```typescript
export interface ExportResultRow extends ExamResultRow {
  durationMinutes: number | null;
}
```

Add this method to the `ReportsService` class, after `getQuestionAccuracy`:

```typescript
  async getExportRows(context: TenantContext, examId: string): Promise<ExportResultRow[]> {
    const rows = await this.examsService.getResults(context, examId);
    const attemptIds = rows.map((row) => row.attemptId).filter((id): id is string => id !== null);
    const startedAtById = await this.fetchStartedAtByAttemptId(context, attemptIds);

    return rows.map((row) => {
      const startedAt = row.attemptId ? startedAtById.get(row.attemptId) : undefined;
      const durationMinutes = startedAt && row.submittedAt
        ? (row.submittedAt.getTime() - startedAt.getTime()) / 60_000
        : null;
      return { ...row, durationMinutes };
    });
  }
```

Add this test to `apps/api/src/reports/reports.service.spec.ts`, as a new `describe` sibling to `getSummary`/`getQuestionAccuracy`:

```typescript
  describe('getExportRows', () => {
    it('enriches each result row with durationMinutes computed from startedAt/submittedAt', async () => {
      examsService.getResults.mockResolvedValue([
        row({ status: 'submitted', attemptId: 'a1', submittedAt: new Date('2026-01-01T00:20:00Z') }),
        row({ status: 'in_progress', attemptId: 'a2', submittedAt: null }),
        row({ status: 'invited', attemptId: null }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', startedAt: new Date('2026-01-01T00:00:00Z') },
            { id: 'a2', startedAt: new Date('2026-01-01T00:00:00Z') },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const exportRows = await service.getExportRows(context, 'exam-1');

      expect(exportRows[0].durationMinutes).toBe(20);
      expect(exportRows[1].durationMinutes).toBeNull();
      expect(exportRows[2].durationMinutes).toBeNull();
    });
  });
```

Run: `npm run test:api -- reports.service`
Expected: `Tests: 8 passed, 8 total`

- [ ] **Step 5: Write the exporter implementations**

Create `apps/api/src/reports/exporters/csv-exporter.ts`:

```typescript
import { stringify } from 'csv-stringify/sync';
import { ExportResultRow } from '../reports.service';

const COLUMNS = ['candidateName', 'status', 'score', 'maxScore', 'percentage', 'passFail', 'submittedAt', 'durationMinutes'];

export function exportResultsToCsv(rows: ExportResultRow[]): Buffer {
  const records = rows.map((row) => ({
    candidateName: row.candidateName,
    status: row.status,
    score: row.score ?? '',
    maxScore: row.maxScore ?? '',
    percentage: row.percentage ?? '',
    passFail: row.passFail ?? '',
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : '',
    durationMinutes: row.durationMinutes ?? '',
  }));
  const csv = stringify(records, { header: true, columns: COLUMNS });
  return Buffer.from(csv, 'utf-8');
}
```

Create `apps/api/src/reports/exporters/xlsx-exporter.ts`:

```typescript
import ExcelJS from 'exceljs';
import { ExportResultRow } from '../reports.service';

const COLUMNS = [
  { header: 'Candidate Name', key: 'candidateName', width: 24 },
  { header: 'Status', key: 'status', width: 16 },
  { header: 'Score', key: 'score', width: 10 },
  { header: 'Max Score', key: 'maxScore', width: 10 },
  { header: 'Percentage', key: 'percentage', width: 12 },
  { header: 'Pass/Fail', key: 'passFail', width: 10 },
  { header: 'Submitted At', key: 'submittedAt', width: 22 },
  { header: 'Duration (min)', key: 'durationMinutes', width: 14 },
];

export async function exportResultsToXlsx(rows: ExportResultRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');
  sheet.columns = COLUMNS;
  rows.forEach((row) => {
    sheet.addRow({
      candidateName: row.candidateName,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      passFail: row.passFail,
      submittedAt: row.submittedAt ? row.submittedAt.toISOString() : '',
      durationMinutes: row.durationMinutes,
    });
  });
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
```

Create `apps/api/src/reports/exporters/pdf-exporter.ts`:

```typescript
import PDFDocument from 'pdfkit';
import { ExportResultRow } from '../reports.service';

export function exportResultsToPdf(rows: ExportResultRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('Exam Results', { align: 'left' });
    doc.moveDown();
    doc.fontSize(10);

    rows.forEach((row) => {
      const line = [
        row.candidateName,
        row.status,
        row.score !== null ? `${row.score}/${row.maxScore}` : '-',
        row.percentage !== null ? `${row.percentage}%` : '-',
        row.passFail ?? '-',
        row.durationMinutes !== null ? `${Math.round(row.durationMinutes)} min` : '-',
      ].join('   ');
      doc.text(line);
    });

    doc.end();
  });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm run test:api -- exporters`
Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 7: Add the export route**

Create `apps/api/src/reports/dto/export-format-query.dto.ts`:

```typescript
import { IsIn } from 'class-validator';

export class ExportFormatQueryDto {
  @IsIn(['csv', 'xlsx', 'pdf'])
  format!: 'csv' | 'xlsx' | 'pdf';
}
```

Modify `apps/api/src/reports/reports.controller.ts` — replace the full file with:

```typescript
import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { ReportsService, ExportResultRow } from './reports.service';
import { ExportFormatQueryDto } from './dto/export-format-query.dto';
import { exportResultsToCsv } from './exporters/csv-exporter';
import { exportResultsToXlsx } from './exporters/xlsx-exporter';
import { exportResultsToPdf } from './exporters/pdf-exporter';

const EXPORT_CONTENT_TYPES: Record<string, string> = {
  csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

@Controller('exams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(':id/results/summary')
  @RequirePermissions('exam:manage')
  getSummary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getSummary(tenant, id);
  }

  @Get(':id/results/question-accuracy')
  @RequirePermissions('exam:manage')
  getQuestionAccuracy(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getQuestionAccuracy(tenant, id);
  }

  @Get(':id/results/export')
  @RequirePermissions('exam:manage')
  async exportResults(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: ExportFormatQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Buffer> {
    const rows = await this.reportsService.getExportRows(tenant, id);
    const buffer = await this.buildExportBuffer(query.format, rows);

    res.set({
      'Content-Type': EXPORT_CONTENT_TYPES[query.format],
      'Content-Disposition': `attachment; filename="exam-${id}-results.${query.format}"`,
    });
    return buffer;
  }

  private buildExportBuffer(format: 'csv' | 'xlsx' | 'pdf', rows: ExportResultRow[]): Buffer | Promise<Buffer> {
    if (format === 'csv') {
      return exportResultsToCsv(rows);
    }
    if (format === 'xlsx') {
      return exportResultsToXlsx(rows);
    }
    return exportResultsToPdf(rows);
  }
}
```

- [ ] **Step 8: Write the failing e2e test**

Add to `apps/api/test/exam-reporting.e2e-spec.ts`, after the `'returns per-question accuracy...'` test:

```typescript
  it('exports results as CSV, XLSX, and PDF with correct headers and non-empty bodies', async () => {
    const csvResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=csv`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(csvResponse.headers['content-type']).toContain('text/csv');
    expect(csvResponse.headers['content-disposition']).toContain('attachment');
    expect(csvResponse.text).toContain('Alice');

    const xlsxResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=xlsx`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(xlsxResponse.headers['content-type']).toContain('spreadsheetml');
    expect(Number(xlsxResponse.headers['content-length'])).toBeGreaterThan(0);

    const pdfResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=pdf`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(pdfResponse.headers['content-type']).toBe('application/pdf');
    expect(Number(pdfResponse.headers['content-length'])).toBeGreaterThan(0);

    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=bogus`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);
  });

  it('returns 404 for all three reporting endpoints when the exam belongs to a different organization', async () => {
    const otherPlan = await prisma.plan.create({
      data: { name: `ci-reporting-other-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    const otherOrg = await prisma.organization.create({
      data: { name: 'CI Reporting Other Org', slug: `ci-reporting-other-org-${randomUUID()}`, planId: otherPlan.id },
    });
    const otherExam = await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) =>
      tx.exam.create({ data: { organizationId: otherOrg.id, title: 'Other Org Exam', createdBy: randomUUID() } }),
    );

    await request(adminHttp)
      .get(`/api/v1/exams/${otherExam.id}/results/summary`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
    await request(adminHttp)
      .get(`/api/v1/exams/${otherExam.id}/results/question-accuracy`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
    await request(adminHttp)
      .get(`/api/v1/exams/${otherExam.id}/results/export?format=csv`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);

    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: otherOrg.id } }));
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: otherPlan.id } }).catch(() => undefined);
  });
```

This proves tenant isolation directly at the HTTP layer for all three new endpoints — note that no prior phase actually had an equivalent HTTP-level cross-org 404 test for `GET /exams/:id/results` itself (only low-level RLS coverage exists in `tenant-isolation.e2e-spec.ts`, which doesn't exercise this route); this test closes that gap for the new reporting routes directly rather than assuming coverage that turned out not to exist.

- [ ] **Step 9: Run the e2e test to verify it passes**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 10: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/reports apps/api/test/exam-reporting.e2e-spec.ts
git commit -m "feat: add CSV/Excel/PDF export of exam results"
```

---

### Task 4: Final verification

**Files:** None — verification only, no code changes expected.

**Interfaces:** N/A.

- [ ] **Step 1: Run the full unit suites**

Run: `npm run test:api`
Expected: all suites pass, including `reports.service.spec.ts` (8 tests) and the three exporter specs (5 tests).

Run: `npm run test:exam-runtime`
Expected: unchanged from before this phase (145 or later baseline) — this phase makes zero changes to `apps/exam-runtime`.

- [ ] **Step 2: Run the full e2e suite serially**

Run: `npm run test:api:e2e -- --runInBand`
Expected: all suites pass, including the new `exam-reporting.e2e-spec.ts` (4 tests). If the standing pre-existing parallel-worker DB-contention flake (documented across nearly every prior phase) appears in a non-serial run, re-confirm via `git stash`/A-B comparison against the pre-Phase-4d baseline, exactly as every prior phase's Task 4 has done — do not treat it as a regression without that comparison.

- [ ] **Step 3: Build both apps**

Run: `npm run build --workspace=apps/api`
Expected: exit 0, no TypeScript errors (this exercises the new `csv-stringify`/`exceljs`/`pdfkit` type imports compiling cleanly).

Run: `npm run build --workspace=apps/exam-runtime`
Expected: exit 0 — unaffected by this phase, confirms no accidental cross-app breakage.

- [ ] **Step 4: Confirm no migration drift**

Run: `npx prisma migrate status --schema=apps/api/prisma/schema.prisma`
Expected: "Database schema is up to date!" — this phase adds no migration, so this step confirms nothing was accidentally left uncommitted or drifted.

- [ ] **Step 5: Dead-reference sweep**

Confirm the new `reports` module doesn't leave anything orphaned:

Run: `grep -rn "ReportsModule\|ReportsController\|ReportsService" apps/api/src/app.module.ts apps/api/src/reports`
Expected: `ReportsModule` appears in `app.module.ts`'s imports; `ReportsController`/`ReportsService` are only referenced within `apps/api/src/reports/` itself (module wiring) — no stray references elsewhere.
