# Exam Templates/Cloning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter duplicate any existing exam (any status) into a new draft exam with the same settings, sections, and question/pool-tag links, via a one-click "Duplicate" action.

**Architecture:** A new `POST /exams/:id/duplicate` endpoint on the existing `ExamsController`/`ExamsService` clones the source exam's config (never its runtime/candidate data) inside one `forTenant` transaction, then records an audit entry. The frontend adds a "Duplicate" row action to the exams list that calls this endpoint and navigates straight to the clone's edit page.

**Tech Stack:** NestJS + Prisma (apps/api), Next.js App Router + TanStack Query (apps/web), Jest (unit + e2e), Playwright.

## Global Constraints

- Duplication is a single "Duplicate" action — no new "Template" entity, no `isTemplate` flag.
- The clone always resets `schedulingEnabled` to `false` and both window fields to `null`, regardless of the source's scheduling state.
- Any exam can be duplicated regardless of its own status (`draft`/`published`/`archived`); the clone itself always starts as `draft`.
- The action lives only on the exams list page, as a row-level action next to "Edit" — not also on the exam edit page.
- No title-entry dialog — the clone is created immediately with title `"<Original Title> (Copy)"`.
- Same permission gate as every other exam-mutating action: `exam:manage`.
- `Question`/`Tag` rows are never copied — the clone re-links to the same ids (they are shared, organization-scoped resources, not owned by the exam).
- Nothing under `Invitation`/`Attempt` is ever read or copied during duplication.

---

### Task 1: Backend — `POST /exams/:id/duplicate`

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts:232` (insert `duplicate()` between `publish()` and `createSection()`)
- Modify: `apps/api/src/exams/exams.controller.ts:54` (insert `duplicate` route between `publish` and `createSection`)
- Modify: `apps/api/src/exams/exams.service.spec.ts:745` (insert new tests between the publish tests and the `describe('getResults'...)` block)
- Modify: `apps/api/test/exam-builder.e2e-spec.ts` (append two new `it(...)` blocks to the existing `describe('Exam Builder HTTP flow', ...)` block, after the "sets and retrieves a section's target duration" test)

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant`, `AuditService.record` (both already injected into `ExamsService`), the existing `ExamSection`/`ExamSectionQuestion`/`ExamSectionPoolTag` Prisma models.
- Produces: `ExamsService.duplicate(context: TenantContext, userId: string, id: string): Promise<Exam>` and `POST /exams/:id/duplicate` (guarded by `exam:manage`, returns 201 with the new `Exam` row, 404 if `id` doesn't exist or belongs to another org).

- [ ] **Step 1: Write the failing unit tests**

Open `apps/api/src/exams/exams.service.spec.ts`. Insert the following after line 745 (the closing `});` of `'throws BadRequestException when publishing an exam with a section that has no questions'`... actually after the LAST publish test, `'rejects publish when a pool section has fewer matching questions than its pool size'`, which ends at line 745) and before the blank line + `describe('getResults', ...)` on line 747:

```typescript

  describe('duplicate', () => {
    it("duplicates an exam's own settings, resetting status and scheduling regardless of source", async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            title: 'Backend Round',
            instructions: 'Answer all questions.',
            durationMinutes: 45,
            passCriteriaPercent: 60,
            randomizeOrder: true,
            schedulingEnabled: true,
            availabilityWindowStart: new Date('2026-07-20T09:00:00.000Z'),
            availabilityWindowEnd: new Date('2026-07-27T18:00:00.000Z'),
            sections: [],
          }),
          create: jest.fn().mockResolvedValue({ id: 'exam-2', title: 'Backend Round (Copy)' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.duplicate(context, 'user-1', 'exam-1');

      expect(result).toEqual({ id: 'exam-2', title: 'Backend Round (Copy)' });
      expect(tx.exam.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          title: 'Backend Round (Copy)',
          instructions: 'Answer all questions.',
          durationMinutes: 45,
          passCriteriaPercent: 60,
          randomizeOrder: true,
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          createdBy: 'user-1',
        },
      });
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'exam.duplicated',
        entityType: 'exam',
        entityId: 'exam-2',
        metadata: { sourceExamId: 'exam-1' },
      });
    });

    it('duplicates a fixed section and a pool section, re-linking the same questions and tags', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            title: 'Mixed Round',
            instructions: null,
            durationMinutes: 60,
            passCriteriaPercent: 40,
            randomizeOrder: false,
            schedulingEnabled: false,
            availabilityWindowStart: null,
            availabilityWindowEnd: null,
            sections: [
              {
                id: 'section-1',
                title: 'Fixed Section',
                orderIndex: 0,
                selectionMode: 'fixed',
                poolSize: null,
                poolDifficulty: null,
                targetDurationMinutes: 15,
                questions: [
                  { questionId: 'q1', orderIndex: 0 },
                  { questionId: 'q2', orderIndex: 1 },
                ],
                poolTags: [],
              },
              {
                id: 'section-2',
                title: 'Pool Section',
                orderIndex: 1,
                selectionMode: 'pool',
                poolSize: 3,
                poolDifficulty: 'hard',
                targetDurationMinutes: null,
                questions: [],
                poolTags: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }],
              },
            ],
          }),
          create: jest.fn().mockResolvedValue({ id: 'exam-2', title: 'Mixed Round (Copy)' }),
        },
        examSection: {
          create: jest
            .fn()
            .mockResolvedValueOnce({ id: 'new-section-1' })
            .mockResolvedValueOnce({ id: 'new-section-2' }),
        },
        examSectionQuestion: {
          createMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.duplicate(context, 'user-1', 'exam-1');

      expect(tx.examSection.create).toHaveBeenNthCalledWith(1, {
        data: {
          examId: 'exam-2',
          title: 'Fixed Section',
          orderIndex: 0,
          selectionMode: 'fixed',
          poolSize: null,
          poolDifficulty: null,
          targetDurationMinutes: 15,
        },
      });
      expect(tx.examSection.create).toHaveBeenNthCalledWith(2, {
        data: {
          examId: 'exam-2',
          title: 'Pool Section',
          orderIndex: 1,
          selectionMode: 'pool',
          poolSize: 3,
          poolDifficulty: 'hard',
          targetDurationMinutes: null,
          poolTags: { create: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }] },
        },
      });
      expect(tx.examSectionQuestion.createMany).toHaveBeenCalledWith({
        data: [
          { sectionId: 'new-section-1', questionId: 'q1', orderIndex: 0 },
          { sectionId: 'new-section-1', questionId: 'q2', orderIndex: 1 },
        ],
      });
    });

    it('throws NotFoundException when duplicating an exam that does not exist', async () => {
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.duplicate(context, 'user-1', 'missing-id')).rejects.toThrow(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest src/exams/exams.service.spec.ts -t duplicate`
Expected: FAIL with `service.duplicate is not a function`.

- [ ] **Step 3: Implement `ExamsService.duplicate()`**

In `apps/api/src/exams/exams.service.ts`, insert this method between the closing `}` of `publish()` (line 232) and the start of `createSection()` (line 234):

```typescript

  async duplicate(context: TenantContext, userId: string, id: string): Promise<Exam> {
    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: {
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              questions: { orderBy: { orderIndex: 'asc' } },
              poolTags: true,
            },
          },
        },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }

      const clone = await tx.exam.create({
        data: {
          organizationId: context.organizationId as string,
          title: `${exam.title} (Copy)`,
          instructions: exam.instructions,
          durationMinutes: exam.durationMinutes,
          passCriteriaPercent: exam.passCriteriaPercent,
          randomizeOrder: exam.randomizeOrder,
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          createdBy: userId,
        },
      });

      for (const section of exam.sections) {
        const newSection = await tx.examSection.create({
          data: {
            examId: clone.id,
            title: section.title,
            orderIndex: section.orderIndex,
            selectionMode: section.selectionMode,
            poolSize: section.poolSize,
            poolDifficulty: section.poolDifficulty,
            targetDurationMinutes: section.targetDurationMinutes,
            ...(section.poolTags.length > 0
              ? { poolTags: { create: section.poolTags.map((poolTag) => ({ tagId: poolTag.tagId })) } }
              : {}),
          },
        });

        if (section.questions.length > 0) {
          await tx.examSectionQuestion.createMany({
            data: section.questions.map((link) => ({
              sectionId: newSection.id,
              questionId: link.questionId,
              orderIndex: link.orderIndex,
            })),
          });
        }
      }

      return clone;
    });

    await this.audit.record(context, {
      actorUserId: userId,
      action: 'exam.duplicated',
      entityType: 'exam',
      entityId: created.id,
      metadata: { sourceExamId: id },
    });

    return created;
  }
```

Add the corresponding controller route. In `apps/api/src/exams/exams.controller.ts`, insert between the `publish` method (ends line 54) and the `createSection` method (starts line 56):

```typescript

  @Post(':id/duplicate')
  @RequirePermissions('exam:manage')
  duplicate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.examsService.duplicate(tenant, userId, id);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest src/exams/exams.service.spec.ts`
Expected: PASS, all tests including the 3 new `duplicate` tests.

- [ ] **Step 5: Write the e2e test**

Open `apps/api/test/exam-builder.e2e-spec.ts`. Append these two `it(...)` blocks inside the `describe('Exam Builder HTTP flow', ...)` block, immediately after the closing `});` of `'sets and retrieves a section\'s target duration'` (the last test in the file) and before the final `});` that closes the `describe` block:

```typescript

  it('duplicates an exam, cloning settings, sections, and question/pool-tag links while resetting status and scheduling', async () => {
    const sourceExamResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        title: 'Source Round',
        instructions: 'Clone me',
        durationMinutes: 45,
        passCriteriaPercent: 55,
        randomizeOrder: true,
      })
      .expect(201);
    const sourceExamId = sourceExamResponse.body.id;

    const fixedSectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${sourceExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Fixed Section', targetDurationMinutes: 20 })
      .expect(201);
    const fixedSectionId = fixedSectionResponse.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${sourceExamId}/sections/${fixedSectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionAId, questionBId] })
      .expect(200);

    const tagQuestionResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Duplicate-flow tag question', difficulty: 'medium', marks: 1, tags: ['clone-tag'],
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    const cloneTagId = tagQuestionResponse.body.tags[0].id;

    const poolSectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${sourceExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section' })
      .expect(201);
    const poolSectionId = poolSectionResponse.body.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/exams/${sourceExamId}/sections/${poolSectionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section', selectionMode: 'pool', poolSize: 1, poolTagIds: [cloneTagId] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${sourceExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const duplicateResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${sourceExamId}/duplicate`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    expect(duplicateResponse.body.title).toBe('Source Round (Copy)');
    expect(duplicateResponse.body.status).toBe('draft');
    expect(duplicateResponse.body.schedulingEnabled).toBe(false);
    expect(duplicateResponse.body.durationMinutes).toBe(45);
    expect(duplicateResponse.body.passCriteriaPercent).toBe(55);
    expect(duplicateResponse.body.randomizeOrder).toBe(true);
    const clonedExamId = duplicateResponse.body.id;

    const clonedDetailResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${clonedExamId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(clonedDetailResponse.body.sections).toHaveLength(2);
    const clonedFixedSection = clonedDetailResponse.body.sections.find((s: { title: string }) => s.title === 'Fixed Section');
    expect(clonedFixedSection.targetDurationMinutes).toBe(20);
    expect(clonedFixedSection.questions.map((q: { questionId: string }) => q.questionId).sort()).toEqual(
      [questionAId, questionBId].sort(),
    );
    const clonedPoolSection = clonedDetailResponse.body.sections.find((s: { title: string }) => s.title === 'Pool Section');
    expect(clonedPoolSection.selectionMode).toBe('pool');
    expect(clonedPoolSection.poolSize).toBe(1);

    const clonedPoolTags = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.examSectionPoolTag.findMany({ where: { sectionId: clonedPoolSection.id } }),
    );
    expect(clonedPoolTags.map((poolTag) => poolTag.tagId)).toEqual([cloneTagId]);

    const sourceDetailResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${sourceExamId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(sourceDetailResponse.body.status).toBe('published');
    expect(sourceDetailResponse.body.sections).toHaveLength(2);
  });

  it('returns 404 when duplicating an exam that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/exams/00000000-0000-0000-0000-000000000000/duplicate')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
  });
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run: `cd apps/api && timeout 100 npx jest --config ./test/jest-e2e.json --runInBand exam-builder.e2e-spec.ts`
Expected: PASS, all tests including the 2 new `duplicate` tests. (Wrapped with an external bounded timeout — this project has a documented history of e2e hangs on an unguarded `afterAll`; a hang should fail loudly, not run forever.)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.controller.ts apps/api/src/exams/exams.service.spec.ts apps/api/test/exam-builder.e2e-spec.ts
git commit -m "feat: add POST /exams/:id/duplicate to clone an exam's settings, sections, and question/pool-tag links"
```

---

### Task 2: Frontend — "Duplicate" action on the exams list

**Files:**
- Modify: `apps/web/lib/hooks/useExams.ts:57` (append `useDuplicateExam()` after `usePublishExam()`)
- Modify: `apps/web/app/(recruiter)/exams/page.tsx` (full rewrite — adds router, toast, mutation, and the Duplicate action)
- Modify: `apps/web/app/(recruiter)/exams/page.test.tsx` (full rewrite — wraps existing tests in `ToastProvider`, adds `mockPush` for assertions, adds 2 new tests)

**Interfaces:**
- Consumes: `POST /exams/:id/duplicate` from Task 1 (returns the new `Exam` row, at minimum `{ id: string, title: string }`).
- Produces: `useDuplicateExam(): UseMutationResult` — `mutate(examId: string, { onSuccess, onError })`, mirroring `usePublishExam()`'s shape but taking the target exam id as the mutation variable instead of a closed-over `id`.

- [ ] **Step 1: Write the failing frontend tests**

Read the current `apps/web/app/(recruiter)/exams/page.test.tsx` (already shown above — 3 existing tests). Replace the entire file with:

```tsx
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ExamsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('ExamsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('lists exams with their status badge', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
  });

  it('shows loading state while exams are fetching', async () => {
    let resolveExams: (value: any) => void;
    const examsPromise = new Promise((resolve) => {
      resolveExams = resolve;
    });

    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        await examsPromise;
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Loading…')).toBeInTheDocument(), { timeout: 2000 });
    resolveExams!(null);

    await waitFor(() => expect(screen.queryByText('Loading…')).not.toBeInTheDocument());
  });

  it('shows error state when exam fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load exams.')).toBeInTheDocument();
  });

  it("duplicates an exam and navigates to the new exam's edit page", async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/duplicate') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'exam-2', title: 'Backend Round (Copy)' }), { status: 201 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/exams/exam-2/edit'));
  });

  it('shows an error toast when duplicating an exam fails', async () => {
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/exams/exam-1/duplicate') && options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'Exam not found' }), { status: 404 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([{ id: 'exam-1', title: 'Backend Round', status: 'draft', sections: [] }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));

    await waitFor(() => expect(screen.getByText('Exam not found')).toBeInTheDocument());
    expect(mockPush).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd apps/web && npm test -- exams/page.test.tsx`
Expected: the 3 pre-existing tests still PASS (they only needed the `ToastProvider` wrapper added since `ExamsPage` doesn't call `useToast` yet, so no behavior changed for them); the 2 new tests FAIL because there is no "Duplicate" button yet.

- [ ] **Step 3: Implement `useDuplicateExam()`**

In `apps/web/lib/hooks/useExams.ts`, append after `usePublishExam()` (after its closing `}` on line 68):

```typescript

export function useDuplicateExam() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (examId: string) =>
      apiFetch(`/exams/${examId}/duplicate`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });
}
```

- [ ] **Step 4: Wire the Duplicate action into the exams list page**

Replace the entire contents of `apps/web/app/(recruiter)/exams/page.tsx` with:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useExams, useDuplicateExam } from '../../../lib/hooks/useExams';
import { Table, Badge, Button, useToast, type Column } from '../../../components/ui';
import { Exam, ExamStatus } from '../../../lib/types';

const STATUS_VARIANT: Record<ExamStatus, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

export default function ExamsPage() {
  const { data: exams, isLoading, isError } = useExams();
  const router = useRouter();
  const { toast } = useToast();
  const duplicateExam = useDuplicateExam();

  function handleDuplicate(examId: string) {
    duplicateExam.mutate(examId, {
      onSuccess: (created) => {
        toast('Exam duplicated.');
        router.push(`/exams/${created.id}/edit`);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to duplicate exam.', 'error'),
    });
  }

  const columns: Column<Exam>[] = [
    { key: 'title', header: 'Title', render: (exam) => exam.title, sortValue: (exam) => exam.title },
    { key: 'status', header: 'Status', render: (exam) => <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge> },
    { key: 'edit', header: '', render: (exam) => <Link href={`/exams/${exam.id}/edit`}>Edit</Link> },
    {
      key: 'duplicate',
      header: '',
      render: (exam) => (
        <Button variant="secondary" onClick={() => handleDuplicate(exam.id)} disabled={duplicateExam.isPending}>
          Duplicate
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
        <p role="alert" className="text-sm text-red-600">
          Failed to load exams.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exams</h1>
        <Link href="/exams/new">
          <Button>New exam</Button>
        </Link>
      </div>
      <Table columns={columns} rows={exams ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/web && npm test -- exams/page.test.tsx`
Expected: PASS, all 5 tests.

Then run the full frontend suite to confirm no regression elsewhere:

Run: `cd apps/web && npm test`
Expected: PASS, all suites.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useExams.ts "apps/web/app/(recruiter)/exams/page.tsx" "apps/web/app/(recruiter)/exams/page.test.tsx"
git commit -m "feat: add Duplicate action to the recruiter exams list"
```

---

### Task 3: Playwright — extend the recruiter golden path

**Files:**
- Modify: `apps/web/e2e/recruiter-golden-path.spec.ts:42-45` (insert the duplicate step between the "Publish" click and the "Candidates" navigation)

**Interfaces:**
- Consumes: the "Duplicate" button and exams-list row structure from Task 2; the `examTitle` variable already defined earlier in this spec (line 29).
- Produces: end-to-end proof that clicking "Duplicate" creates a draft clone titled `"<title> (Copy)"` and that it appears in the exams list — the one thing only a real browser flow proves (real HTTP round-trip, real list re-render).

- [ ] **Step 1: Write the extended e2e step**

In `apps/web/e2e/recruiter-golden-path.spec.ts`, the test currently reads (lines 42-45):

```ts
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
```

Replace those 4 lines with:

```ts
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('row', { name: examTitle }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);
  await expect(page.getByLabel('Title')).toHaveValue(`${examTitle} (Copy)`);

  await page.getByRole('link', { name: 'Exams' }).click();
  await expect(page).toHaveURL(/\/exams$/);
  await expect(page.getByRole('row', { name: `${examTitle} (Copy)` }).getByText('draft')).toBeVisible();

  await page.getByRole('link', { name: 'Candidates' }).click();
```

The rest of the file (candidate creation and invitation, using the original `examTitle` via `getByRole('option', { name: examTitle, exact: true })`) is unaffected — the clone is a separate draft exam and is never selected for invitation.

- [ ] **Step 2: Confirm dev servers are running, then run the spec**

Ensure `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers are running (see this project's documented Docker/WSL2 port-reclaim workaround if the default ports are unavailable).

Run: `cd apps/web && timeout 180 npx playwright test e2e/recruiter-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 3: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && timeout 180 npx playwright test e2e/recruiter-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/recruiter-golden-path.spec.ts
git commit -m "test: extend recruiter golden path with the exam duplicate action"
```

---

### Task 4: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including every new test from Task 1. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY` in this dev environment) is documented and unrelated.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new test from Task 2.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: every golden path passes, including the extended `recruiter-golden-path.spec.ts` from Task 3.

- [ ] **Step 4: Manual smoke check**

With dev servers running: as recruiter, open the Exams list, click "Duplicate" on any existing exam (try one with a mix of a fixed section and a pool section if available), confirm you land on the new exam's edit page with title `"<original> (Copy)"`, status `draft`, and all sections/settings present. Navigate back to the Exams list and confirm the clone appears there. Confirm the original exam is completely unchanged (status, sections, any invitations still intact).

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md` (overwrite fresh for this feature, per this project's ledger convention):

```
# Exam Templates/Cloning — SDD Progress Ledger

## Tasks
Task 1: complete (backend — POST /exams/:id/duplicate)
Task 2: complete (frontend — Duplicate action on exams list)
Task 3: complete (Playwright — extended recruiter golden path)
Task 4: complete (final verification)
```
