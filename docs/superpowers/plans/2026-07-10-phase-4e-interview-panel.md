# Phase 4e — Interview Panel Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the existing `panel` role read access to exam results (reusing Phase 4d's `ReportsService`) plus two new endpoints: full per-candidate section/question detail, and side-by-side candidate comparison.

**Architecture:** A new `results:view` permission (seed-data only, no schema change) replaces `exam:manage` on every results/report route and is granted to both `panel` and `recruiter`. Two new methods on the existing `ReportsService`/`ReportsController` reuse a shared `computeSectionScores` helper that derives per-section scores from each attempt's `sectionSnapshotJson` (Phase 4b) — correctly handling pool sections where different candidates draw different questions under the same section.

**Tech Stack:** NestJS 10, Prisma 5 (SQL Server) — no new dependencies.

## Global Constraints

- No schema changes, no new Prisma migration — `results:view` is a `Permission`/`RolePermission` seed-data row, applied by re-running `npx prisma db seed`, not a migration.
- `panel`'s full permission set becomes `['org:view', 'results:view']`. `recruiter`'s becomes its existing 4 permissions plus `results:view` (keeps `exam:manage` — zero recruiter regression).
- Every results/report route (`GET /exams/:id/results`, `/results/summary`, `/results/question-accuracy`, `/results/export`, and the two new routes below) is gated by `@RequirePermissions('results:view')`, not `exam:manage`.
- Candidate comparison is scoped to a single exam: 2+ `candidateIds` required, all must be invited to that exam, or `400 Bad Request`.
- Candidate detail shows full transparency: question text, the candidate's selected option(s), correctness, marks awarded, and the correct option(s) — not just scores.
- Per-section score comparison groups by `sectionId` (stable across an exam's candidates), never by question identity — this is what makes comparison meaningful even for pool sections where candidates draw different questions under the same section.
- Both new methods (`getCandidateDetail`, `compareCandidates`) MUST call `ExamsService.getResults(context, examId)` first, exactly like `getSummary`/`getQuestionAccuracy`/`getExportRows` already do — this is not optional. It is the sole source of two things neither method may re-derive independently: the settle-if-expired-attempts side effect (an expired-but-unsettled attempt must show its final graded state, not stale `in_progress` data) and the org-scoped exam lookup (a wrong-org `examId` must 404 the same way every other reports route already does). Only the additional per-attempt data these two methods uniquely need (`sectionSnapshotJson`, `answers`) should come from a separate, more targeted query afterward.
- This phase touches only `apps/api`. `apps/exam-runtime` is untouched.

---

## File Structure

- **Modify** `apps/api/prisma/seed.ts` — add the `results:view` permission and both role mappings.
- **Modify** `apps/api/src/exams/exams.controller.ts` — swap `getResults`'s permission.
- **Modify** `apps/api/src/reports/reports.controller.ts` — swap 3 existing routes' permissions; add 2 new routes across Tasks 2–3.
- **Modify** `apps/api/src/reports/reports.service.ts` — add `computeSectionScores` (shared private helper), `getCandidateDetail`, `compareCandidates`, and their exported types.
- **Modify** `apps/api/src/reports/reports.service.spec.ts` — unit tests for both new methods.
- **Modify** `apps/api/test/exam-reporting.e2e-spec.ts` — add a `panel`-role user to the shared fixture, plus new tests per task.

---

### Task 1: `results:view` permission — replace `exam:manage` on all results/report routes

**Files:**
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/exams/exams.controller.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Modify: `apps/api/test/exam-reporting.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks (this is Task 1).
- Produces: a `panelAccessToken` variable in `exam-reporting.e2e-spec.ts`'s shared `beforeAll` scope — Tasks 2 and 3 reuse it to prove panel access to the new routes they add.

- [ ] **Step 1: Add a panel-role user to the shared e2e fixture**

Open `apps/api/test/exam-reporting.e2e-spec.ts`. Find this block near the top of the `describe`:

```typescript
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
```

Replace it with:

```typescript
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let panelAccessToken: string;
```

Find this block inside `beforeAll` (the recruiter/org-admin user creation):

```typescript
    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-reporting.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-reporting.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );
```

Replace it with:

```typescript
    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    const panelHash = await argon2.hash('PanelPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-reporting.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-reporting.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'panel@ci-reporting.test', passwordHash: panelHash, role: 'panel' } }),
      ]),
    );
```

Find this block (the org-admin login, right after the recruiter login):

```typescript
    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-reporting.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;
```

Replace it with:

```typescript
    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-reporting.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    panelAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'panel@ci-reporting.test', password: 'PanelPassw0rd!' })
        .expect(200)
    ).body.accessToken;
```

- [ ] **Step 2: Write the failing e2e tests**

Add these two tests to `apps/api/test/exam-reporting.e2e-spec.ts`, after the last existing `it(...)` block in the file (the cross-org 404 test):

```typescript
  it('grants panel-role users read access to all results/report routes via results:view', async () => {
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/summary`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/question-accuracy`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results/export?format=csv`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
  });

  it('rejects panel-role users from exam-management routes -- results:view does not imply exam:manage', async () => {
    await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .send({ title: 'Should Not Be Created' })
      .expect(403);
  });
```

- [ ] **Step 3: Run the e2e test to verify it fails**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: FAIL — the four `results:view`-gated-route assertions in the first new test return `403` (panel currently holds only `org:view`), so `.expect(200)` fails.

- [ ] **Step 4: Add the `results:view` permission to the seed**

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
];
```

And replace the `ROLE_PERMISSIONS` mapping:

```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage', 'results:view'],
  panel: ['org:view', 'results:view'],
};
```

- [ ] **Step 5: Apply the seed change to the dev database**

Run: `cd apps/api && npx prisma db seed && cd ../..`
Expected: exit 0, ending with `Seed complete: super@platform.test / DevSuper123!, admin@demo-org.test / DevAdmin123! (org slug: demo-org)`. The seed script's `upsert` calls are idempotent — this only inserts the new `results:view` permission row and its two new `RolePermission` rows, it does not duplicate or disturb any existing seeded data.

- [ ] **Step 6: Swap the permission decorator on the 4 existing routes**

Modify `apps/api/src/exams/exams.controller.ts` — find:

```typescript
  @Get(':id/results')
  @RequirePermissions('exam:manage')
  getResults(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.getResults(tenant, id);
  }
```

Replace with:

```typescript
  @Get(':id/results')
  @RequirePermissions('results:view')
  getResults(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.getResults(tenant, id);
  }
```

Modify `apps/api/src/reports/reports.controller.ts` — replace the full file with:

```typescript
import { Controller, Get, Param, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
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
  @RequirePermissions('results:view')
  getSummary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getSummary(tenant, id);
  }

  @Get(':id/results/question-accuracy')
  @RequirePermissions('results:view')
  getQuestionAccuracy(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reportsService.getQuestionAccuracy(tenant, id);
  }

  @Get(':id/results/export')
  @RequirePermissions('results:view')
  async exportResults(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query() query: ExportFormatQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const rows = await this.reportsService.getExportRows(tenant, id);
    const buffer = await this.buildExportBuffer(query.format, rows);

    res.set({
      'Content-Type': EXPORT_CONTENT_TYPES[query.format],
      'Content-Disposition': `attachment; filename="exam-${id}-results.${query.format}"`,
    });
    return new StreamableFile(buffer);
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

(This is identical to the file Phase 4d left, with `exam:manage` → `results:view` on the three existing routes. Tasks 2 and 3 will add new routes to this same file.)

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: all tests in the file pass, including the 2 new ones. The pre-existing tests (recruiter accessing summary/question-accuracy/export/results, the cross-org 404 test) must ALSO still pass unchanged — this proves `recruiter` lost nothing from the permission swap since it now holds `results:view` too.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/seed.ts apps/api/src/exams/exams.controller.ts apps/api/src/reports/reports.controller.ts apps/api/test/exam-reporting.e2e-spec.ts
git commit -m "feat: add results:view permission, gate all results/report routes with it"
```

---

### Task 2: Candidate report detail endpoint

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.service.spec.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Modify: `apps/api/test/exam-reporting.e2e-spec.ts`

**Interfaces:**
- Consumes: `panelAccessToken` from Task 1's e2e fixture. The existing `examId`, `questionId`, `correctOptionId` fixture variables from the file's outer `beforeAll` scope (Phase 4d). `ExamsService.getResults()`'s `ExamResultRow` shape (Phase 4d) as the source of every candidate-level field except section/question detail. The `row(...)` test helper already defined in `reports.service.spec.ts` (Phase 4d) — reuse it for unit-test fixtures, do not redefine it.
- Produces: `ReportsService.computeSectionScores(sectionSnapshot, marksAwardedByQuestionId, marksByQuestionId): SectionScore[]` (private helper — Task 3 reuses this exact signature, do not redefine it), `ReportsService.getCandidateDetail(context, examId, candidateId): Promise<CandidateDetail>`, and the exported `SectionScore`/`CandidateDetail` interfaces.

- [ ] **Step 1: Write the failing unit tests**

Add to `apps/api/src/reports/reports.service.spec.ts`. First, update the top-level imports (find and replace):

```typescript
import { Test } from '@nestjs/testing';
import { ReportsService } from './reports.service';
```

with:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';
```

Then add this new `describe` block, as a sibling to the existing `getSummary`/`getQuestionAccuracy`/`getExportRows` blocks. Note this method calls `ExamsService.getResults()` first (same as every other method in this service) rather than querying `Invitation` directly — so the mocks are `examsService.getResults.mockResolvedValue([...])` plus a `tx` for the follow-up attempt/question query, not a `tx.invitation` mock:

```typescript
  describe('getCandidateDetail', () => {
    it("groups a candidate's questions by section, including a section aggregate score and full per-question detail", async () => {
      examsService.getResults.mockResolvedValue([
        row({
          candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted',
          score: 5, maxScore: 14, percentage: 35.71, passFail: 'fail', submittedAt: new Date('2026-01-01T00:20:00Z'),
        }),
      ]);
      const tx = {
        attempt: {
          findFirst: jest.fn().mockResolvedValue({
            sectionSnapshotJson: JSON.stringify([
              { sectionId: 'sec-1', title: 'Section One', questionIds: ['q1', 'q2'] },
              { sectionId: 'sec-2', title: 'Section Two', questionIds: ['q3'] },
            ]),
            answers: [
              { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isCorrect: true, marksAwarded: 5 },
              { questionId: 'q3', selectedOptionIdsJson: JSON.stringify(['opt-c']), isCorrect: false, marksAwarded: 0 },
            ],
          }),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', text: 'A', isCorrect: true }, { id: 'opt-b', text: 'B', isCorrect: false }] },
            { id: 'q2', text: 'Q2 text', type: 'single_mcq', marks: 6, negativeMarks: 0, options: [{ id: 'opt-c2', text: 'C', isCorrect: true }] },
            { id: 'q3', text: 'Q3 text', type: 'single_mcq', marks: 3, negativeMarks: 0, options: [{ id: 'opt-c', text: 'C', isCorrect: false }, { id: 'opt-d', text: 'D', isCorrect: true }] },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.candidateId).toBe('cand-1');
      expect(detail.score).toBe(5);
      expect(detail.maxScore).toBe(14);
      expect(detail.sections).toHaveLength(2);
      expect(detail.sections[0]).toMatchObject({ sectionId: 'sec-1', title: 'Section One', score: 5, maxScore: 11 });
      expect(detail.sections[0].questions).toHaveLength(2);
      expect(detail.sections[0].questions[0]).toEqual({
        questionId: 'q1', questionText: 'Q1 text', type: 'single_mcq', marks: 5, negativeMarks: 0,
        options: [{ id: 'opt-a', text: 'A' }, { id: 'opt-b', text: 'B' }],
        selectedOptionIds: ['opt-a'], correctOptionIds: ['opt-a'],
        isCorrect: true, marksAwarded: 5,
      });
      expect(detail.sections[0].questions[1]).toEqual({
        questionId: 'q2', questionText: 'Q2 text', type: 'single_mcq', marks: 6, negativeMarks: 0,
        options: [{ id: 'opt-c2', text: 'C' }],
        selectedOptionIds: [], correctOptionIds: ['opt-c2'],
        isCorrect: null, marksAwarded: null,
      });
      expect(detail.sections[1]).toMatchObject({ sectionId: 'sec-2', title: 'Section Two', score: 0, maxScore: 3 });
    });

    it('returns null score fields and an empty sections array for a candidate with no attempt yet, without querying attempt/question data', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-2', candidateName: 'Bob', attemptId: null, status: 'invited' }),
      ]);

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-2');

      expect(detail).toEqual({
        candidateId: 'cand-2', candidateName: 'Bob', status: 'invited',
        score: null, maxScore: null, percentage: null, passFail: null, submittedAt: null,
        proctoringAnalysis: null, sections: [],
      });
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the candidate was never invited to this exam', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1' })]);

      await expect(service.getCandidateDetail(context, 'exam-1', 'cand-999')).rejects.toThrow(NotFoundException);
    });
  });
```

(`row(...)` is the same helper already defined in this file's `getSummary` tests — reuse it, do not redefine it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- reports.service`
Expected: FAIL — `service.getCandidateDetail is not a function`

- [ ] **Step 3: Add the shared helper, the new types, and the service method**

Modify `apps/api/src/reports/reports.service.ts` — update the top import line:

```typescript
import { Injectable } from '@nestjs/common';
```

to:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
```

Add these interfaces after the existing `ExportResultRow` interface:

```typescript
export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
}

interface SectionSnapshotEntryShape {
  sectionId: string;
  title: string;
  questionIds: string[];
}

interface CandidateDetailQuestion {
  questionId: string;
  questionText: string;
  type: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  marksAwarded: number | null;
}

interface CandidateDetailSection extends SectionScore {
  questions: CandidateDetailQuestion[];
}

export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
  sections: CandidateDetailSection[];
}
```

Add this method to the `ReportsService` class, after `getExportRows`. It calls `ExamsService.getResults()` first — exactly like `getSummary`/`getQuestionAccuracy`/`getExportRows` — so it inherits the settle-if-expired-attempts side effect and the org-scoped exam lookup (a wrong-org `examId` 404s via `getResults()` itself) without re-implementing either:

```typescript
  async getCandidateDetail(context: TenantContext, examId: string, candidateId: string): Promise<CandidateDetail> {
    const rows = await this.examsService.getResults(context, examId);
    const row = rows.find((resultRow) => resultRow.candidateId === candidateId);
    if (!row) {
      throw new NotFoundException(`Candidate ${candidateId} not found on exam ${examId}`);
    }

    const base = {
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      passFail: row.passFail,
      submittedAt: row.submittedAt,
      proctoringAnalysis: row.proctoringAnalysis,
    };

    if (!row.attemptId) {
      return { ...base, sections: [] };
    }

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: row.attemptId as string },
        select: { sectionSnapshotJson: true, answers: true },
      });
      if (!attempt) {
        return { ...base, sections: [] };
      }

      const sectionSnapshot: SectionSnapshotEntryShape[] = JSON.parse(attempt.sectionSnapshotJson);
      const allQuestionIds = sectionSnapshot.flatMap((section) => section.questionIds);
      const questions = await tx.question.findMany({
        where: { id: { in: allQuestionIds }, organizationId: context.organizationId as string },
        include: { options: true },
      });
      const questionsById = new Map(questions.map((question) => [question.id, question]));
      const answersByQuestionId = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
      const marksAwardedByQuestionId = new Map(
        attempt.answers.filter((answer) => answer.marksAwarded !== null).map((answer) => [answer.questionId, answer.marksAwarded as number]),
      );
      const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

      const sectionScores = this.computeSectionScores(sectionSnapshot, marksAwardedByQuestionId, marksByQuestionId);
      const sectionScoreById = new Map(sectionScores.map((score) => [score.sectionId, score]));

      const sections: CandidateDetailSection[] = sectionSnapshot.map((section) => {
        const scoreEntry = sectionScoreById.get(section.sectionId)!;
        return {
          sectionId: section.sectionId,
          title: section.title,
          score: scoreEntry.score,
          maxScore: scoreEntry.maxScore,
          questions: section.questionIds.map((questionId) => {
            const question = questionsById.get(questionId);
            const answer = answersByQuestionId.get(questionId);
            return {
              questionId,
              questionText: question?.text ?? '',
              type: question?.type ?? '',
              marks: question?.marks ?? 0,
              negativeMarks: question?.negativeMarks ?? 0,
              options: question?.options.map((option) => ({ id: option.id, text: option.text })) ?? [],
              selectedOptionIds: answer ? JSON.parse(answer.selectedOptionIdsJson) : [],
              correctOptionIds: question?.options.filter((option) => option.isCorrect).map((option) => option.id) ?? [],
              isCorrect: answer?.isCorrect ?? null,
              marksAwarded: answer?.marksAwarded ?? null,
            };
          }),
        };
      });

      return { ...base, sections };
    });
  }

  private computeSectionScores(
    sectionSnapshot: SectionSnapshotEntryShape[],
    marksAwardedByQuestionId: Map<string, number>,
    marksByQuestionId: Map<string, number>,
  ): SectionScore[] {
    return sectionSnapshot.map((section) => {
      let score = 0;
      let maxScore = 0;
      for (const questionId of section.questionIds) {
        score += marksAwardedByQuestionId.get(questionId) ?? 0;
        maxScore += marksByQuestionId.get(questionId) ?? 0;
      }
      return { sectionId: section.sectionId, title: section.title, score, maxScore };
    });
  }
```

(`BadRequestException` is imported now for Task 3's use — unused-import lint would otherwise flag it if Task 3 weren't coming next in the same file; since this is a single continuously-developed module across tasks, importing it now is correct, not premature.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api -- reports.service`
Expected: `Tests: 11 passed, 11 total`

- [ ] **Step 5: Add the controller route**

Modify `apps/api/src/reports/reports.controller.ts` — update the import line:

```typescript
import { ReportsService, ExportResultRow } from './reports.service';
```

to:

```typescript
import { ReportsService, ExportResultRow, CandidateDetail } from './reports.service';
```

Add this route to the `ReportsController` class, after `getQuestionAccuracy`:

```typescript
  @Get(':id/candidates/:candidateId/report')
  @RequirePermissions('results:view')
  getCandidateDetail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
  ): Promise<CandidateDetail> {
    return this.reportsService.getCandidateDetail(tenant, id, candidateId);
  }
```

- [ ] **Step 6: Write the failing e2e tests**

Add to `apps/api/test/exam-reporting.e2e-spec.ts`, after the two tests Task 1 added:

```typescript
  it('returns full per-candidate detail with section/question breakdown', async () => {
    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const aliceCandidateId = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Alice').candidateId;

    const detailResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/candidates/${aliceCandidateId}/report`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);

    expect(detailResponse.body.candidateName).toBe('Alice');
    expect(detailResponse.body.score).toBe(10);
    expect(detailResponse.body.maxScore).toBe(10);
    expect(detailResponse.body.sections).toHaveLength(1);
    expect(detailResponse.body.sections[0].questions).toHaveLength(1);
    expect(detailResponse.body.sections[0].questions[0]).toMatchObject({
      questionId, questionText: 'What is 2+2?', isCorrect: true, marksAwarded: 10,
    });
    expect(detailResponse.body.sections[0].questions[0].correctOptionIds).toEqual([correctOptionId]);
  });

  it('returns 404 for a candidate not invited to the exam', async () => {
    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/candidates/${randomUUID()}/report`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: all tests pass, including the 2 new ones.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports apps/api/test/exam-reporting.e2e-spec.ts
git commit -m "feat: add candidate report detail endpoint with section/question breakdown"
```

---

### Task 3: Candidate comparison endpoint

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`
- Modify: `apps/api/src/reports/reports.service.spec.ts`
- Modify: `apps/api/src/reports/reports.controller.ts`
- Modify: `apps/api/test/exam-reporting.e2e-spec.ts`

**Interfaces:**
- Consumes: `computeSectionScores` from Task 2 (same file, reuse — do not redefine). `BadRequestException`/`NotFoundException` already imported in Task 2. `ExamsService.getResults()`'s `ExamResultRow` shape, same as `getCandidateDetail`. The `row(...)` test helper.
- Produces: `ReportsService.compareCandidates(context, examId, candidateIdsParam): Promise<CandidateComparisonRow[]>` and the exported `CandidateComparisonRow` interface.

- [ ] **Step 1: Write the failing unit tests**

Add to `apps/api/src/reports/reports.service.spec.ts`, as a new `describe` block sibling to `getCandidateDetail`. Like `getCandidateDetail`, this method calls `ExamsService.getResults()` first, so the mocks are `examsService.getResults.mockResolvedValue([...])` plus a `tx` for the follow-up attempt/question query — not a `tx.invitation` mock:

```typescript
  describe('compareCandidates', () => {
    it('computes section-wise scores per candidate from their own attempt snapshot, aligning by sectionId even when pool sections drew different questions', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted', score: 5, maxScore: 5, percentage: 100, passFail: 'pass' }),
        row({ candidateId: 'cand-2', candidateName: 'Bob', attemptId: 'a2', status: 'submitted', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a1', sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Pool Section', questionIds: ['q1'] }]), answers: [{ questionId: 'q1', marksAwarded: 5 }] },
            { id: 'a2', sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Pool Section', questionIds: ['q2'] }]), answers: [{ questionId: 'q2', marksAwarded: 0 }] },
          ]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const comparison = await service.compareCandidates(context, 'exam-1', 'cand-1,cand-2');

      expect(comparison[0].sectionScores).toEqual([{ sectionId: 'sec-1', title: 'Pool Section', score: 5, maxScore: 5 }]);
      expect(comparison[1].sectionScores).toEqual([{ sectionId: 'sec-1', title: 'Pool Section', score: 0, maxScore: 5 }]);
    });

    it('throws BadRequestException when fewer than 2 candidateIds are provided, without calling getResults', async () => {
      await expect(service.compareCandidates(context, 'exam-1', 'cand-1')).rejects.toThrow(BadRequestException);
      expect(examsService.getResults).not.toHaveBeenCalled();
    });

    it('throws BadRequestException naming candidate(s) not invited to this exam', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1', candidateName: 'Alice' })]);

      await expect(service.compareCandidates(context, 'exam-1', 'cand-1,cand-999')).rejects.toThrow(BadRequestException);
    });

    it('returns null score fields and empty sectionScores for a candidate with no attempt', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', candidateName: 'Alice', attemptId: null, status: 'invited' }),
        row({ candidateId: 'cand-2', candidateName: 'Bob', attemptId: null, status: 'invited' }),
      ]);

      const comparison = await service.compareCandidates(context, 'exam-1', 'cand-1,cand-2');

      expect(comparison[0]).toEqual({
        candidateId: 'cand-1', candidateName: 'Alice', status: 'invited',
        score: null, maxScore: null, percentage: null, passFail: null,
        proctoringAnalysis: null, sectionScores: [],
      });
    });
  });
```

(`row(...)` is the same helper reused from `getSummary`'s and `getCandidateDetail`'s tests.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:api -- reports.service`
Expected: FAIL — `service.compareCandidates is not a function`

- [ ] **Step 3: Add the type and the service method**

Modify `apps/api/src/reports/reports.service.ts` — add this interface after `CandidateDetail`:

```typescript
export interface CandidateComparisonRow {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
  sectionScores: SectionScore[];
}
```

Add this method to the `ReportsService` class, after `getCandidateDetail` (and its `computeSectionScores` helper, which this method also calls). Like `getCandidateDetail`, it validates its own input first (cheap, no DB needed), then calls `ExamsService.getResults()` for the settle-if-expired side effect, the org-scoped exam lookup, and the authoritative per-candidate rows — only the additional `sectionSnapshotJson`/`answers` data comes from a separate targeted query:

```typescript
  async compareCandidates(context: TenantContext, examId: string, candidateIdsParam: string): Promise<CandidateComparisonRow[]> {
    const candidateIds = candidateIdsParam.split(',').map((id) => id.trim()).filter((id) => id.length > 0);
    if (candidateIds.length < 2) {
      throw new BadRequestException('At least 2 candidateIds are required to compare');
    }

    const rows = await this.examsService.getResults(context, examId);
    const rowByCandidateId = new Map(rows.map((row) => [row.candidateId, row]));
    const missingIds = candidateIds.filter((id) => !rowByCandidateId.has(id));
    if (missingIds.length > 0) {
      throw new BadRequestException(`Candidate(s) not invited to this exam: ${missingIds.join(', ')}`);
    }
    const selectedRows = candidateIds.map((id) => rowByCandidateId.get(id)!);
    const attemptIds = selectedRows.map((row) => row.attemptId).filter((id): id is string => id !== null);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = attemptIds.length === 0
        ? []
        : await tx.attempt.findMany({ where: { id: { in: attemptIds } }, select: { id: true, sectionSnapshotJson: true, answers: true } });
      const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));

      const allQuestionIds = new Set<string>();
      for (const attempt of attempts) {
        const snapshot: SectionSnapshotEntryShape[] = JSON.parse(attempt.sectionSnapshotJson);
        snapshot.forEach((section) => section.questionIds.forEach((questionId) => allQuestionIds.add(questionId)));
      }
      const questions = allQuestionIds.size === 0
        ? []
        : await tx.question.findMany({
            where: { id: { in: [...allQuestionIds] }, organizationId: context.organizationId as string },
            select: { id: true, marks: true },
          });
      const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

      return selectedRows.map((row) => {
        const base = {
          candidateId: row.candidateId,
          candidateName: row.candidateName,
          status: row.status,
          score: row.score,
          maxScore: row.maxScore,
          percentage: row.percentage,
          passFail: row.passFail,
          proctoringAnalysis: row.proctoringAnalysis,
        };
        const attempt = row.attemptId ? attemptById.get(row.attemptId) : undefined;
        if (!attempt) {
          return { ...base, sectionScores: [] };
        }
        const sectionSnapshot: SectionSnapshotEntryShape[] = JSON.parse(attempt.sectionSnapshotJson);
        const marksAwardedByQuestionId = new Map(
          attempt.answers.filter((answer) => answer.marksAwarded !== null).map((answer) => [answer.questionId, answer.marksAwarded as number]),
        );
        const sectionScores = this.computeSectionScores(sectionSnapshot, marksAwardedByQuestionId, marksByQuestionId);
        return { ...base, sectionScores };
      });
    });
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:api -- reports.service`
Expected: `Tests: 15 passed, 15 total`

- [ ] **Step 5: Add the controller route**

Modify `apps/api/src/reports/reports.controller.ts` — update the import line:

```typescript
import { ReportsService, ExportResultRow, CandidateDetail } from './reports.service';
```

to:

```typescript
import { ReportsService, ExportResultRow, CandidateDetail, CandidateComparisonRow } from './reports.service';
```

Add this route to the `ReportsController` class, after `getCandidateDetail`:

```typescript
  @Get(':id/candidates/compare')
  @RequirePermissions('results:view')
  compareCandidates(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Query('candidateIds') candidateIds: string,
  ): Promise<CandidateComparisonRow[]> {
    return this.reportsService.compareCandidates(tenant, id, candidateIds ?? '');
  }
```

- [ ] **Step 6: Write the failing e2e tests**

Add to `apps/api/test/exam-reporting.e2e-spec.ts`, after the two tests Task 2 added:

```typescript
  it("compares 3 candidates' section-wise scores side by side", async () => {
    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const byName = (name: string) =>
      resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === name).candidateId;
    const aliceId = byName('Alice');
    const bobId = byName('Bob');
    const carolId = byName('Carol');

    const compareResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/candidates/compare?candidateIds=${aliceId},${bobId},${carolId}`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);

    expect(compareResponse.body).toHaveLength(3);
    const alice = compareResponse.body.find((row: { candidateId: string }) => row.candidateId === aliceId);
    expect(alice.score).toBe(10);
    expect(alice.sectionScores).toEqual([{ sectionId: expect.any(String), title: 'Section One', score: 10, maxScore: 10 }]);
    const carol = compareResponse.body.find((row: { candidateId: string }) => row.candidateId === carolId);
    expect(carol.status).toBe('in_progress');
    expect(carol.score).toBeNull();
  });

  it('returns 400 when fewer than 2 candidateIds are provided', async () => {
    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const aliceId = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Alice').candidateId;

    await request(adminHttp)
      .get(`/api/v1/exams/${examId}/candidates/compare?candidateIds=${aliceId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);
  });
```

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `npm run test:api:e2e -- exam-reporting`
Expected: all tests pass, including the 2 new ones.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports apps/api/test/exam-reporting.e2e-spec.ts
git commit -m "feat: add candidate comparison endpoint with section-wise score alignment"
```

---

### Task 4: Final verification

**Files:** None — verification only, no code changes expected.

**Interfaces:** N/A.

- [ ] **Step 1: Run the full unit suites**

Run: `npm run test:api`
Expected: all suites pass, including `reports.service.spec.ts`'s now-15 tests.

Run: `npm run test:exam-runtime`
Expected: unchanged from the pre-Phase-4e baseline (146/146) — this phase makes zero changes to `apps/exam-runtime`.

- [ ] **Step 2: Run the full e2e suite serially**

Run: `npm run test:api:e2e -- --runInBand`
Expected: all suites pass, including `exam-reporting.e2e-spec.ts`'s now-11 tests (5 from Phase 4d + 6 new from this phase: 2 per task across Tasks 1–3). If the standing pre-existing parallel-worker DB-contention flake appears in a non-serial run, re-confirm via `git stash`/A-B comparison against the pre-Phase-4e baseline, exactly as every prior phase's Task 4 has done.

- [ ] **Step 3: Build both apps**

Run: `npm run build --workspace=apps/api`
Expected: exit 0, no TypeScript errors.

Run: `npm run build --workspace=apps/exam-runtime`
Expected: exit 0 — unaffected by this phase.

- [ ] **Step 4: Confirm no migration drift**

Run: `npx prisma migrate status --schema=apps/api/prisma/schema.prisma`
Expected: "Database schema is up to date!" — this phase adds no migration.

- [ ] **Step 5: Confirm the seed change actually persisted**

Run a direct query to prove `results:view` is genuinely in the dev database (not just in `seed.ts`'s source), e.g. from `apps/api`:
```bash
npx prisma studio
```
or, non-interactively, run this ad hoc script and inspect the output:
```bash
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.rolePermission.findMany({ where: { permission: { key: 'results:view' } }, include: { permission: true } })
  .then((rows) => { console.log(rows.map((r) => r.role)); return prisma.\$disconnect(); });
"
```
Expected output: `[ 'recruiter', 'panel' ]` (order may vary) — confirms both role mappings landed, not just the permission row itself.

- [ ] **Step 6: Dead-reference sweep**

Run: `grep -rn "exam:manage" apps/api/src/reports apps/api/src/exams/exams.controller.ts`
Expected: zero matches — confirms every results/report route was actually switched to `results:view`, none accidentally left on the old permission.
