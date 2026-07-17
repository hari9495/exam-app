# Live Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live, F1-race-style leaderboard ranking candidates by correct-answer count on auto-gradable (MCQ/true-false) questions — recruiters see it via real-time WebSocket push with full names, candidates see an anonymized version via polling.

**Architecture:** A new, self-contained `LeaderboardService` (no dependency on `GradingModule`/`MonitoringModule` — only `TenantPrismaService` — to avoid any risk of circular NestJS module imports) computes rankings on demand from live `Answer` rows, reusing each attempt's frozen `questionOrderJson` snapshot (exams with pool-mode sections give different candidates different question sets, so ranking must be computed per-attempt, not against one shared "the exam's questions" list). Recruiters get push via the existing `MonitoringGateway` WebSocket; candidates poll a new session-derived endpoint.

**Tech Stack:** NestJS (`apps/exam-runtime`), Prisma/SQL Server, Next.js/React + `@tanstack/react-query` + `socket.io-client` (`apps/web`), `framer-motion` (new dependency, row-reorder animation), Jest/Supertest/Playwright.

## Global Constraints

- Ranking metric is raw correct-answer **count**, not marks-weighted score, not accounting for negative marking.
- Only `single_mcq`, `multi_mcq`, `true_false` questions count toward ranking — `code` questions are excluded (matches `AttemptSettlementService.finalize()`'s existing treatment of code questions as not-yet-scorable pre-manual-grading).
- Tie-break: whichever attempt reached its current correct-count **first** (earliest "most recent correct answer" timestamp) ranks higher.
- No new persisted grading state — correctness is computed fresh from `Answer.selectedOptionIdsJson` + `QuestionOption.isCorrect` every time, nothing written back to `Answer` early.
- Population: any candidate with a started `Attempt` in the exam (any status — `in_progress`, `paused`, `blocked`, or terminal), regardless of proctoring state.
- Recruiters see real candidate names; candidates see stable per-exam anonymized labels ("Candidate 1", "Candidate 2", ...) assigned by ascending `Invitation.invitedAt` order, except their own row which is always labeled "You".
- Recruiter delivery: WebSocket push via the existing `/monitoring` namespace (`MonitoringGateway`). Candidate delivery: polling (~5s), matching the existing `useAttemptQuery` polling convention — no new candidate-side WebSocket auth.
- Candidate-facing routes are session-derived, no `:id`/`:attemptId` params, matching `attempt.controller.ts`'s existing convention.

---

## Task 1: LeaderboardService — core computation

**Files:**
- Create: `apps/exam-runtime/src/leaderboard/leaderboard.service.ts`
- Create: `apps/exam-runtime/src/leaderboard/leaderboard.service.spec.ts`
- Create: `apps/exam-runtime/src/leaderboard/leaderboard.module.ts`

**Interfaces:**
- Produces: `AUTO_GRADABLE_QUESTION_TYPES: string[]`, `LeaderboardEntry { attemptId, invitationId, candidateId, correctCount, rank }`, `LeaderboardService.compute(context: TenantContext, examId: string): Promise<LeaderboardEntry[]>` (full ranked list, not sliced), `LeaderboardService.computeRecruiterView(context, examId): Promise<RecruiterLeaderboardRow[]>` (top 30 with names), `LeaderboardService.computeCandidateView(context, examId, viewerInvitationId): Promise<CandidateLeaderboardResponse>` (top 30 anonymized + viewer's own rank) — consumed by Task 2 (`MonitoringGateway`) and Task 3/4 (`AttemptService`).

- [ ] **Step 1: Write failing tests for the core ranking logic**

Create `apps/exam-runtime/src/leaderboard/leaderboard.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { TenantPrismaService } from '@exam-platform/shared';
import { LeaderboardService } from './leaderboard.service';

describe('LeaderboardService', () => {
  let service: LeaderboardService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [LeaderboardService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(LeaderboardService);
  });

  const mcqQuestion = (id: string, correctOptionId: string) => ({
    id,
    type: 'single_mcq',
    options: [
      { id: correctOptionId, isCorrect: true },
      { id: `${correctOptionId}-wrong`, isCorrect: false },
    ],
  });

  function mockTx(questions: unknown[], attempts: unknown[]) {
    return {
      attempt: { findMany: jest.fn().mockResolvedValue(attempts) },
      question: { findMany: jest.fn().mockResolvedValue(questions) },
    };
  }

  describe('compute', () => {
    it('ranks attempts by correct-answer count, descending', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const q2 = mcqQuestion('q2', 'q2-correct');
      const attempts = [
        {
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'q2', selectedOptionIdsJson: JSON.stringify(['q2-correct']), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        },
        {
          id: 'attempt-2', invitationId: 'inv-2', candidateId: 'cand-2',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
          ],
        },
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1, q2], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result).toEqual([
        { attemptId: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1', correctCount: 2, rank: 1 },
        { attemptId: 'attempt-2', invitationId: 'inv-2', candidateId: 'cand-2', correctCount: 1, rank: 2 },
      ]);
    });

    it('breaks ties by whoever reached the count first', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        {
          id: 'attempt-slow', invitationId: 'inv-slow', candidateId: 'cand-slow',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:10Z') }],
        },
        {
          id: 'attempt-fast', invitationId: 'inv-fast', candidateId: 'cand-fast',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') }],
        },
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result.map((r) => r.attemptId)).toEqual(['attempt-fast', 'attempt-slow']);
    });

    it('excludes code questions from the correct count', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      // A code question never appears in the `question.findMany` result because the service
      // filters by type in the query itself — simulate that by simply not including it.
      const attempts = [
        {
          id: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1',
          questionOrderJson: JSON.stringify(['q1', 'code-q']),
          answers: [
            { questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') },
            { questionId: 'code-q', selectedOptionIdsJson: JSON.stringify([]), answeredAt: new Date('2026-01-01T00:00:02Z') },
          ],
        },
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result).toEqual([{ attemptId: 'attempt-1', invitationId: 'inv-1', candidateId: 'cand-1', correctCount: 1, rank: 1 }]);
    });

    it('ranks an attempt with zero correct answers last, not omitted', async () => {
      const q1 = mcqQuestion('q1', 'q1-correct');
      const attempts = [
        {
          id: 'attempt-none', invitationId: 'inv-none', candidateId: 'cand-none',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [],
        },
        {
          id: 'attempt-one', invitationId: 'inv-one', candidateId: 'cand-one',
          questionOrderJson: JSON.stringify(['q1']),
          answers: [{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['q1-correct']), answeredAt: new Date('2026-01-01T00:00:01Z') }],
        },
      ];
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([q1], attempts)));

      const result = await service.compute(context, 'exam-1');

      expect(result.map((r) => r.attemptId)).toEqual(['attempt-one', 'attempt-none']);
      expect(result[1].correctCount).toBe(0);
    });

    it('returns an empty array when no attempts have started', async () => {
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(mockTx([], [])));

      const result = await service.compute(context, 'exam-1');

      expect(result).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/exam-runtime && npx jest leaderboard.service.spec.ts`
Expected: FAIL — `Cannot find module './leaderboard.service'`.

- [ ] **Step 3: Implement `LeaderboardService`**

Create `apps/exam-runtime/src/leaderboard/leaderboard.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

export const AUTO_GRADABLE_QUESTION_TYPES = ['single_mcq', 'multi_mcq', 'true_false'];
const TOP_N = 30;

export interface LeaderboardEntry {
  attemptId: string;
  invitationId: string;
  candidateId: string;
  correctCount: number;
  rank: number;
}

export interface RecruiterLeaderboardRow {
  rank: number;
  candidateId: string;
  candidateName: string;
  correctCount: number;
}

export interface CandidateLeaderboardRow {
  rank: number;
  correctCount: number;
  label: string;
  isYou: boolean;
}

export interface CandidateLeaderboardResponse {
  you: { rank: number; correctCount: number } | null;
  top: CandidateLeaderboardRow[];
}

function isAnswerCorrect(correctOptionIds: string[], selectedOptionIds: string[]): boolean {
  const selectedSet = new Set(selectedOptionIds);
  const correctSet = new Set(correctOptionIds);
  return selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
}

@Injectable()
export class LeaderboardService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async compute(context: TenantContext, examId: string): Promise<LeaderboardEntry[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = await tx.attempt.findMany({ where: { examId }, include: { answers: true } });
      if (attempts.length === 0) {
        return [];
      }

      const allQuestionIds = new Set<string>();
      for (const attempt of attempts) {
        const ids: string[] = JSON.parse(attempt.questionOrderJson);
        ids.forEach((id) => allQuestionIds.add(id));
      }
      // Only auto-gradable questions are fetched — a question id from an attempt's snapshot
      // that isn't in this map (because it's a `code` question) is simply skipped below.
      const questions = await tx.question.findMany({
        where: { id: { in: [...allQuestionIds] }, type: { in: AUTO_GRADABLE_QUESTION_TYPES } },
        include: { options: true },
      });
      const questionsById = new Map(questions.map((question) => [question.id, question]));

      const unranked = attempts.map((attempt) => {
        const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
        const answersByQuestionId = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));
        let correctCount = 0;
        let latestCorrectAnsweredAt: Date | null = null;
        for (const questionId of questionIds) {
          const question = questionsById.get(questionId);
          if (!question) continue;
          const answer = answersByQuestionId.get(questionId);
          if (!answer) continue;
          const selectedOptionIds: string[] = JSON.parse(answer.selectedOptionIdsJson);
          const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
          if (isAnswerCorrect(correctOptionIds, selectedOptionIds)) {
            correctCount += 1;
            if (!latestCorrectAnsweredAt || answer.answeredAt > latestCorrectAnsweredAt) {
              latestCorrectAnsweredAt = answer.answeredAt;
            }
          }
        }
        return {
          attemptId: attempt.id,
          invitationId: attempt.invitationId,
          candidateId: attempt.candidateId,
          correctCount,
          tieBreakAt: latestCorrectAnsweredAt,
        };
      });

      unranked.sort((a, b) => {
        if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
        const aTime = a.tieBreakAt?.getTime() ?? Infinity;
        const bTime = b.tieBreakAt?.getTime() ?? Infinity;
        return aTime - bTime;
      });

      return unranked.map(({ tieBreakAt: _tieBreakAt, ...entry }, index) => ({ ...entry, rank: index + 1 }));
    });
  }

  async computeRecruiterView(context: TenantContext, examId: string): Promise<RecruiterLeaderboardRow[]> {
    const entries = await this.compute(context, examId);
    const top = entries.slice(0, TOP_N);
    if (top.length === 0) {
      return [];
    }
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const candidates = await tx.candidate.findMany({ where: { id: { in: top.map((entry) => entry.candidateId) } } });
      const nameById = new Map(candidates.map((candidate) => [candidate.id, candidate.name]));
      return top.map((entry) => ({
        rank: entry.rank,
        candidateId: entry.candidateId,
        candidateName: nameById.get(entry.candidateId) ?? 'Unknown',
        correctCount: entry.correctCount,
      }));
    });
  }

  async computeCandidateView(
    context: TenantContext,
    examId: string,
    viewerInvitationId: string,
  ): Promise<CandidateLeaderboardResponse> {
    const entries = await this.compute(context, examId);
    const you = entries.find((entry) => entry.invitationId === viewerInvitationId);
    const top = entries.slice(0, TOP_N);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const invitations = await tx.invitation.findMany({ where: { examId }, orderBy: { invitedAt: 'asc' } });
      const labelByInvitationId = new Map(invitations.map((invitation, index) => [invitation.id, `Candidate ${index + 1}`]));

      return {
        you: you ? { rank: you.rank, correctCount: you.correctCount } : null,
        top: top.map((entry) => ({
          rank: entry.rank,
          correctCount: entry.correctCount,
          isYou: entry.invitationId === viewerInvitationId,
          label: entry.invitationId === viewerInvitationId ? 'You' : (labelByInvitationId.get(entry.invitationId) ?? 'Candidate'),
        })),
      };
    });
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/exam-runtime && npx jest leaderboard.service.spec.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Create the module**

Create `apps/exam-runtime/src/leaderboard/leaderboard.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

@Module({
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/leaderboard/
git commit -m "feat: add LeaderboardService core ranking computation"
```

---

## Task 2: Recruiter delivery — MonitoringGateway push

**Files:**
- Modify: `apps/exam-runtime/src/monitoring/monitoring.module.ts`
- Modify: `apps/exam-runtime/src/monitoring/monitoring.gateway.ts`
- Modify: `apps/exam-runtime/src/monitoring/monitoring.gateway.spec.ts`

**Interfaces:**
- Consumes: `LeaderboardService.computeRecruiterView` (Task 1).
- Produces: `MonitoringGateway.emitLeaderboardUpdate(examId: string, rows: RecruiterLeaderboardRow[]): void`, and a `leaderboard:snapshot` event emitted on `join-exam` — consumed by Task 3 (broadcast trigger) and Task 6 (frontend).

- [ ] **Step 1: Import `LeaderboardModule` into `MonitoringModule`**

In `apps/exam-runtime/src/monitoring/monitoring.module.ts`, add the import (no circular risk — `LeaderboardModule` only depends on `TenantPrismaService`, it does not import `MonitoringModule` or `GradingModule`):

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';
import { MonitoringEventBusBridge } from './monitoring-event-bus-bridge';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [JwtModule.register({}), LeaderboardModule],
  providers: [MonitoringGateway, MonitoringService, MonitoringEventBusBridge],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
```

- [ ] **Step 2: Write failing tests for the gateway changes**

In `apps/exam-runtime/src/monitoring/monitoring.gateway.spec.ts`, add `{ provide: LeaderboardService, useValue: { computeRecruiterView: jest.fn() } }` to the existing `Test.createTestingModule` providers array (match this file's existing mock-object style for `MonitoringService`/`PrismaService`/`TenantPrismaService`), then add:

```ts
  describe('emitLeaderboardUpdate', () => {
    it('emits leaderboard:update to the exam room', () => {
      (gateway as any).server = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

      gateway.emitLeaderboardUpdate('exam-1', [{ rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 3 }]);

      expect((gateway as any).server.to).toHaveBeenCalledWith('exam:exam-1');
      expect((gateway as any).server.emit).toHaveBeenCalledWith('leaderboard:update', [
        { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 3 },
      ]);
    });
  });
```

Also extend the existing `handleJoinExam` test (find the `it` that asserts `roster:snapshot` is emitted after a successful join — match its exact mock setup for `client`/`user`/`monitoring.getRosterSnapshot`) to additionally assert a `leaderboard:snapshot` emit:

```ts
      leaderboardService.computeRecruiterView.mockResolvedValue([
        { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 2 },
      ]);
      // ...(existing handleJoinExam call)...
      expect(client.emit).toHaveBeenCalledWith('leaderboard:snapshot', [
        { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 2 },
      ]);
```
(Match `leaderboardService`'s variable name to whatever you named the mock object in Step 2's provider array — reuse it here rather than declaring a second mock.)

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/exam-runtime && npx jest monitoring.gateway.spec.ts`
Expected: FAIL — `gateway.emitLeaderboardUpdate is not a function`, and the `leaderboard:snapshot` assertion fails since `handleJoinExam` doesn't emit it yet.

- [ ] **Step 4: Implement the gateway changes**

In `apps/exam-runtime/src/monitoring/monitoring.gateway.ts`:

Add imports:
```ts
import { LeaderboardService, RecruiterLeaderboardRow } from '../leaderboard/leaderboard.service';
```

Add `LeaderboardService` to the constructor:
```ts
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly monitoring: MonitoringService,
    private readonly leaderboard: LeaderboardService,
  ) {}
```

In `handleJoinExam`, right after the existing `await client.join(...)` + `client.emit('roster:snapshot', roster)` lines (around line 99-100), add:

```ts
    const leaderboard = await this.leaderboard.computeRecruiterView(context, body.examId);
    client.emit('leaderboard:snapshot', leaderboard);
```

Add a new method after `emitMessageSent`:

```ts
  emitLeaderboardUpdate(examId: string, rows: RecruiterLeaderboardRow[]): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('leaderboard:update', rows);
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/exam-runtime && npx jest monitoring.gateway.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full exam-runtime suite**

Run: `cd apps/exam-runtime && npx jest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/monitoring/monitoring.module.ts apps/exam-runtime/src/monitoring/monitoring.gateway.ts apps/exam-runtime/src/monitoring/monitoring.gateway.spec.ts
git commit -m "feat: push leaderboard updates over the monitoring WebSocket"
```

---

## Task 3: Broadcast trigger — recompute leaderboard on answer save

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.module.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `LeaderboardService.computeRecruiterView` (Task 1), `MonitoringGateway.emitLeaderboardUpdate` (Task 2, already injected into `AttemptService`).
- Produces: nothing new consumed by later tasks — this task only wires the trigger.

- [ ] **Step 1: Import `LeaderboardModule` into `AttemptModule`**

In `apps/exam-runtime/src/attempts/attempt.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { PistonClient } from '../code-execution/piston-client';
import { RunLimiter } from '../code-execution/run-limiter';

@Module({
  imports: [GradingModule, MonitoringModule, LeaderboardModule],
  controllers: [AttemptController],
  providers: [AttemptService, PistonClient, RunLimiter],
})
export class AttemptModule {}
```

- [ ] **Step 2: Write failing tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, add `leaderboardService: { computeRecruiterView: jest.fn(), computeCandidateView: jest.fn() }` to the `beforeEach` mocks and `{ provide: LeaderboardService, useValue: leaderboardService }` to the `Test.createTestingModule` providers array (match this file's existing style for `settlement`/`monitoringGateway`/etc). Then, inside the existing `describe('answer', ...)` block, add:

```ts
  it('recomputes and broadcasts the leaderboard after an auto-gradable answer is saved', async () => {
    const attempt = { id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q1']) };
    const question = { id: 'q1', type: 'single_mcq', options: [{ id: 'opt-a', text: 'A' }, { id: 'opt-b', text: 'B' }] };
    const tx = {
      attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
      question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
      answer: { upsert: jest.fn().mockResolvedValue({}) },
    };
    mockBootstrapThenScoped(tx);
    settlement.settleIfExpired.mockResolvedValue(attempt);
    leaderboardService.computeRecruiterView.mockResolvedValue([{ rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 1 }]);

    await service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] });

    expect(leaderboardService.computeRecruiterView).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'exam-1');
    expect(monitoringGateway.emitLeaderboardUpdate).toHaveBeenCalledWith('exam-1', [
      { rank: 1, candidateId: 'cand-1', candidateName: 'Alice', correctCount: 1 },
    ]);
  });

  it('does not recompute the leaderboard when the answered question is a code question', async () => {
    const attempt = { id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q1']) };
    const question = { id: 'q1', type: 'code', options: [] };
    const tx = {
      attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
      question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
      answer: { upsert: jest.fn().mockResolvedValue({}) },
    };
    mockBootstrapThenScoped(tx);
    settlement.settleIfExpired.mockResolvedValue(attempt);

    await service.answer(session, { questionId: 'q1', answerText: 'print("hi")' });

    expect(leaderboardService.computeRecruiterView).not.toHaveBeenCalled();
    expect(monitoringGateway.emitLeaderboardUpdate).not.toHaveBeenCalled();
  });
```

(Adjust field names — `exam.id`/`organizationId` values — to match this file's existing top-of-file `exam`/`session` fixtures rather than the literal `'exam-1'`/`'org-1'` shown here if those fixtures use different values; check the top of the file first.)

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts -t "leaderboard"`
Expected: FAIL — `leaderboardService.computeRecruiterView` never called, since `AttemptService` doesn't have `LeaderboardService` injected yet.

- [ ] **Step 4: Implement the trigger**

**Important:** `computeRecruiterView` opens its own `tenantPrisma.forTenant(...)` call (its own connection/transaction). Triggering it from *inside* `answer()`'s existing `tx` callback — even fire-and-forget — would start that second transaction before the outer one commits, risking a read of stale/uncommitted data (or worse). The trigger must fire *after* the outer `forTenant(...)` call has resolved, not from within its callback. This requires threading an `isAutoGradable` flag out of the transaction callback alongside the existing response, then checking it in the now-un-nested continuation.

In `apps/exam-runtime/src/attempts/attempt.service.ts`:

Add imports:
```ts
import { LeaderboardService, AUTO_GRADABLE_QUESTION_TYPES } from '../leaderboard/leaderboard.service';
import { Logger } from '@nestjs/common';
```

Add `LeaderboardService` to the constructor and a logger field:
```ts
  private readonly logger = new Logger(AttemptService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly monitoringGateway: MonitoringGateway,
    private readonly pistonClient: PistonClient,
    private readonly runLimiter: RunLimiter,
    private readonly leaderboardService: LeaderboardService,
  ) {}
```

Restructure `answer()` so the `tx` callback returns `{ response, isAutoGradable }` instead of returning the response directly, and the broadcast fires after the transaction has resolved:

```ts
  async answer(
    session: CandidateSession,
    dto: AnswerDto,
  ): Promise<{ questionId: string; selectedOptionIds: string[]; answerText: string | null; isMarkedForReview: boolean }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    const { response, isAutoGradable } = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        throw new BadRequestException(`Cannot answer — attempt status is "${settled.status}"`);
      }

      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      if (!questionIds.includes(dto.questionId)) {
        throw new BadRequestException(`Question ${dto.questionId} is not part of this attempt`);
      }
      const question = await tx.question.findFirstOrThrow({ where: { id: dto.questionId }, include: { options: true } });
      const isMarkedForReview = dto.markedForReview ?? false;

      if (question.type === 'code') {
        await tx.answer.upsert({
          where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
          create: {
            attemptId: settled.id,
            questionId: dto.questionId,
            selectedOptionIdsJson: JSON.stringify([]),
            answerText: dto.answerText ?? null,
            isMarkedForReview,
          },
          update: { answerText: dto.answerText ?? null, isMarkedForReview, answeredAt: new Date() },
        });
        return {
          response: { questionId: dto.questionId, selectedOptionIds: [], answerText: dto.answerText ?? null, isMarkedForReview },
          isAutoGradable: false,
        };
      }

      if (dto.selectedOptionIds.length > 0) {
        this.validateSelection(question, dto.selectedOptionIds);
      }

      await tx.answer.upsert({
        where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
        create: {
          attemptId: settled.id,
          questionId: dto.questionId,
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
        },
        update: { selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds), isMarkedForReview, answeredAt: new Date() },
      });

      return {
        response: { questionId: dto.questionId, selectedOptionIds: dto.selectedOptionIds, answerText: null, isMarkedForReview },
        isAutoGradable: AUTO_GRADABLE_QUESTION_TYPES.includes(question.type),
      };
    });

    if (isAutoGradable) {
      void this.broadcastLeaderboard(organizationId, exam.id).catch((error) =>
        this.logger.error('Failed to broadcast leaderboard update', error as Error),
      );
    }

    return response;
  }
```

Add a new private method at the end of the class, right before the closing brace:

```ts
  private async broadcastLeaderboard(organizationId: string, examId: string): Promise<void> {
    const rows = await this.leaderboardService.computeRecruiterView({ organizationId, isSuperAdmin: false }, examId);
    this.monitoringGateway.emitLeaderboardUpdate(examId, rows);
  }
```

Note: `broadcastLeaderboard` is deliberately fire-and-forget (`void ...catch(...)`, not `await`ed) so it never delays the response to the candidate — but critically, it's only *invoked* after the outer `forTenant(...)` transaction has resolved, so `computeRecruiterView`'s own separate transaction reads the just-committed answer, never a mid-transaction or uncommitted state.

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Run the full exam-runtime suite**

Run: `cd apps/exam-runtime && npx jest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.module.ts apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: broadcast leaderboard updates when a candidate answers an auto-gradable question"
```

---

## Task 4: Candidate endpoint — anonymized leaderboard

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `LeaderboardService.computeCandidateView` (Task 1, already injected in Task 3).
- Produces: `GET /attempt/leaderboard` → `CandidateLeaderboardResponse` (`{ you: {rank, correctCount} | null, top: {rank, correctCount, label, isYou}[] }`) — consumed by Task 7's frontend hook.

- [ ] **Step 1: Write failing tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, add a new `describe` block:

```ts
  describe('getLeaderboard', () => {
    it('delegates to LeaderboardService.computeCandidateView with the resolved organizationId, exam id, and invitation id', async () => {
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(invitationRecord));
      leaderboardService.computeCandidateView.mockResolvedValue({
        you: { rank: 5, correctCount: 3 },
        top: [{ rank: 1, correctCount: 4, label: 'Candidate 1', isYou: false }],
      });

      const result = await service.getLeaderboard(session);

      expect(leaderboardService.computeCandidateView).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        'exam-1',
        'inv-1',
      );
      expect(result).toEqual({
        you: { rank: 5, correctCount: 3 },
        top: [{ rank: 1, correctCount: 4, label: 'Candidate 1', isYou: false }],
      });
    });
  });
```

(Match `invitationRecord`/`exam`/`session` fixture values to this file's actual top-of-file fixtures — this test only needs `resolveContext` to succeed via the existing `mockBootstrapThenScoped`-style first `forTenant` call, no scoped transaction needed since `getLeaderboard` doesn't open one itself.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts -t "getLeaderboard"`
Expected: FAIL — `service.getLeaderboard is not a function`.

- [ ] **Step 3: Implement the service method**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, add the import:
```ts
import { CandidateLeaderboardResponse } from '../leaderboard/leaderboard.service';
```
(Add this to the existing `import { LeaderboardService, AUTO_GRADABLE_QUESTION_TYPES } from '../leaderboard/leaderboard.service';` line from Task 3 rather than a separate import line.)

Add a new public method, near `reportProctoringEvent`/`webcamViolation`:

```ts
  async getLeaderboard(session: CandidateSession): Promise<CandidateLeaderboardResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
    return this.leaderboardService.computeCandidateView({ organizationId, isSuperAdmin: false }, exam.id, invitation.id);
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the controller endpoint**

In `apps/exam-runtime/src/attempts/attempt.controller.ts`, add after `webcamResume` (before `runCode`):

```ts
  @Get('leaderboard')
  getLeaderboard(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.getLeaderboard(candidate);
  }
```

Add `Get` to the existing `@nestjs/common` import if not already imported (check the current import line — `Get` is already used for `getCurrent`, so this should already be present).

- [ ] **Step 6: Run the full exam-runtime suite**

Run: `cd apps/exam-runtime && npx jest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.controller.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: add candidate-facing anonymized leaderboard endpoint"
```

---

## Task 5: Backend e2e verification

**Files:**
- Modify: `apps/api/test/live-monitoring.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-4.

- [ ] **Step 1: Add a leaderboard e2e test**

In `apps/api/test/live-monitoring.e2e-spec.ts`, this file already creates a `true_false` question and publishes an exam in `beforeAll` (reuse `examId`/`recruiterAccessToken` as-is). Add a new `it` block after the existing tests in the `describe('Live Monitoring WebSocket flow', ...)` block:

```ts
  it('pushes a leaderboard:update after a candidate answers an auto-gradable question correctly, and omits code-question answers', async () => {
    const token = await inviteAndGetToken('dana@ci-monitoring.test', 'Dana');
    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    const snapshot = await waitForEvent<any>(socket, 'leaderboard:snapshot');
    expect(snapshot).toEqual([]);

    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);

    const current = await request(runtimeHttp).get('/api/v1/attempt/current').set('Authorization', `Bearer ${accessToken}`).expect(200);
    const questionId = current.body.sections[0].questions[0].id;
    const correctOptionId = current.body.sections[0].questions[0].options.find((option: any) => option.text === 'True')?.id
      ?? current.body.sections[0].questions[0].options[0].id;

    const leaderboardUpdatePromise = waitForEvent<any>(socket, 'leaderboard:update');
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);
    const update = await leaderboardUpdatePromise;

    expect(update).toHaveLength(1);
    expect(update[0]).toMatchObject({ candidateName: 'Dana', correctCount: expect.any(Number) });

    const candidateView = await request(runtimeHttp).get('/api/v1/attempt/leaderboard').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(candidateView.body.you).not.toBeNull();
    expect(candidateView.body.top[0]).toMatchObject({ isYou: true, label: 'You' });

    socket.disconnect();
  });
```

Note: this test doesn't assert the specific `correctCount`/`isCorrect` value since the question's actual correct option isn't controlled by this test's `beforeAll` setup in a way that's asserted elsewhere — the `correctOptionId` lookup falls back to the first option if there's no option literally named `'True'`, so this test may or may not select the actually-correct option. If the exam's seeded `true_false` question in `beforeAll` doesn't have a predictable correct option, adjust this test to first fetch the question's options via the recruiter-side question-bank read endpoint (`GET /api/v1/questions/:id` or similar — check what's available) to know which option is correct before answering, so the assertion on `correctCount` can be exact (e.g. `expect(update[0].correctCount).toBe(1)`) rather than `expect.any(Number)`. Tighten this assertion once you've confirmed the real correct-option lookup path.

- [ ] **Step 2: Run the e2e test**

Run: `cd apps/api && npx jest --config test/jest-e2e.json live-monitoring.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/live-monitoring.e2e-spec.ts
git commit -m "test: add backend e2e coverage for live leaderboard updates"
```

---

## Task 6: Recruiter frontend — Leaderboard tab

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useExamMonitoring.ts`
- Modify: `apps/web/lib/hooks/useExamMonitoring.test.tsx`
- Create: `apps/web/components/LeaderboardPanel.tsx`
- Create: `apps/web/components/LeaderboardPanel.test.tsx`
- Modify: `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `leaderboard:snapshot`/`leaderboard:update` WebSocket events (Task 2).
- Produces: `LeaderboardPanel` component — consumed by the exam edit page's new tab.

- [ ] **Step 1: Install framer-motion**

Run: `cd apps/web && npm install framer-motion`
Expected: `apps/web/package.json` gains a `"framer-motion": "^..."` entry under `dependencies` (pin whatever version npm resolves — check it's compatible with `react@^18.2.0`, already confirmed compatible since framer-motion supports React 18).

- [ ] **Step 2: Add the `RecruiterLeaderboardRow` type**

In `apps/web/lib/types.ts`, add near `RosterRow`/`ProctoringFlag`:

```ts
export interface RecruiterLeaderboardRow {
  rank: number;
  candidateId: string;
  candidateName: string;
  correctCount: number;
}
```

- [ ] **Step 3: Write a failing test for the socket hook extension**

In `apps/web/lib/hooks/useExamMonitoring.test.tsx`, find this file's existing test-harness pattern for socket events (look for how `roster:snapshot`/`attempt:status` are simulated — likely via a mock socket.io-client instance the file already sets up) and add:

```ts
  it('updates leaderboard state on leaderboard:snapshot and leaderboard:update', () => {
    const { result } = renderHookWithSocket(); // use this file's existing render helper
    act(() => {
      emitFromMockSocket('leaderboard:snapshot', [{ rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 2 }]);
    });
    expect(result.current.leaderboard).toEqual([{ rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 2 }]);

    act(() => {
      emitFromMockSocket('leaderboard:update', [{ rank: 1, candidateId: 'c2', candidateName: 'Bob', correctCount: 3 }]);
    });
    expect(result.current.leaderboard).toEqual([{ rank: 1, candidateId: 'c2', candidateName: 'Bob', correctCount: 3 }]);
  });
```

(This is illustrative — read the file's actual existing helper names first, e.g. it may directly construct a mocked `io()` return value with `.on(event, handler)` capture rather than named `renderHookWithSocket`/`emitFromMockSocket` helpers; match whatever pattern the existing `roster:snapshot` test in this file actually uses, including how the mock socket's `.on()` calls are captured and re-invoked.)

- [ ] **Step 4: Run to verify failure**

Run: `cd apps/web && npx jest useExamMonitoring.test.tsx -t "leaderboard"`
Expected: FAIL — `result.current.leaderboard` is `undefined`, hook doesn't track it yet.

- [ ] **Step 5: Extend the hook**

In `apps/web/lib/hooks/useExamMonitoring.ts`, add the import:
```ts
import { RosterRow, ProctoringFlag, ConnectionStatus, RecruiterLeaderboardRow } from '../types';
```

Add a new piece of state and update the return type/object:
```ts
interface UseExamMonitoringResult {
  roster: RosterRow[];
  alerts: ProctoringFlag[];
  leaderboard: RecruiterLeaderboardRow[];
  connectionStatus: ConnectionStatus;
  joinError: string | null;
}
```

Inside the hook body, add alongside the existing `roster`/`alerts` state:
```ts
  const [leaderboard, setLeaderboard] = useState<RecruiterLeaderboardRow[]>([]);
```

Reset it alongside the other resets at the top of the connection effect (where `setRoster([]); setAlerts([]);` already happens):
```ts
    setLeaderboard([]);
```

Add two new socket listeners, alongside the existing `roster:snapshot`/`roster:presence` listeners:
```ts
    socket.on('leaderboard:snapshot', (rows: RecruiterLeaderboardRow[]) => {
      setLeaderboard(rows);
    });

    socket.on('leaderboard:update', (rows: RecruiterLeaderboardRow[]) => {
      setLeaderboard(rows);
    });
```

Add `leaderboard` to the returned object:
```ts
  return { roster, alerts, leaderboard, connectionStatus, joinError };
```

- [ ] **Step 6: Run to verify pass**

Run: `cd apps/web && npx jest useExamMonitoring.test.tsx`
Expected: PASS.

- [ ] **Step 7: Write a failing test for `LeaderboardPanel`**

Create `apps/web/components/LeaderboardPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import * as useExamMonitoringModule from '../lib/hooks/useExamMonitoring';
import { LeaderboardPanel } from './LeaderboardPanel';

describe('LeaderboardPanel', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders ranked rows with candidate name and correct count', () => {
    jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
      roster: [],
      alerts: [],
      leaderboard: [
        { rank: 1, candidateId: 'c1', candidateName: 'Alice', correctCount: 5 },
        { rank: 2, candidateId: 'c2', candidateName: 'Bob', correctCount: 3 },
      ],
      connectionStatus: 'connected',
      joinError: null,
    });

    render(<LeaderboardPanel examId="exam-1" />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('shows an empty-state message when no one has answered yet', () => {
    jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
      roster: [], alerts: [], leaderboard: [], connectionStatus: 'connected', joinError: null,
    });

    render(<LeaderboardPanel examId="exam-1" />);

    expect(screen.getByText(/no answers yet/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `cd apps/web && npx jest LeaderboardPanel.test.tsx`
Expected: FAIL — `Cannot find module './LeaderboardPanel'`.

- [ ] **Step 9: Implement `LeaderboardPanel`**

Create `apps/web/components/LeaderboardPanel.tsx`:

```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useExamMonitoring } from '../lib/hooks/useExamMonitoring';

export function LeaderboardPanel({ examId }: { examId: string }) {
  const { leaderboard } = useExamMonitoring(examId);

  if (leaderboard.length === 0) {
    return <p className="text-sm text-gray-500">No answers yet — the leaderboard fills in as candidates answer.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      <AnimatePresence>
        {leaderboard.map((row) => (
          <motion.li
            key={row.candidateId}
            layout
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 text-right text-sm font-bold text-gray-500">{row.rank}</span>
              <span className="text-sm font-medium text-gray-900">{row.candidateName}</span>
            </div>
            <span className="text-sm font-semibold text-gray-700">{row.correctCount}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
```

`key={row.candidateId}` (not `row.rank`) is what makes `layout` animate a *reorder* rather than a content-swap-in-place — each candidate's row is the same DOM node across renders, framer-motion animates it sliding to its new position when the array order changes.

- [ ] **Step 10: Run to verify pass**

Run: `cd apps/web && npx jest LeaderboardPanel.test.tsx`
Expected: PASS.

- [ ] **Step 11: Add the "Leaderboard" tab to the exam edit page**

In `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`, add the import:
```tsx
import { LeaderboardPanel } from '../../../../../components/LeaderboardPanel';
```

Add a new tab trigger after `<TabsTrigger value="live">Live</TabsTrigger>`:
```tsx
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
```

Add a matching tab content after `<TabsContent value="live">...</TabsContent>`:
```tsx
        <TabsContent value="leaderboard">
          <LeaderboardPanel examId={exam.id} />
        </TabsContent>
```

- [ ] **Step 12: Check for and update the edit page's own test file**

Run: `ls "apps/web/app/(recruiter)/exams/[id]/edit/"` to check whether `page.test.tsx` exists alongside `page.tsx`. If it does, read it, and if it asserts the exact set of visible tabs (e.g. `expect(screen.getAllByRole('tab')).toHaveLength(4)`), update that assertion to account for the new 5th tab; if it doesn't check tab count/labels at all, no change is needed.

- [ ] **Step 13: Run the full frontend suite**

Run: `cd apps/web && npx jest`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/types.ts apps/web/lib/hooks/useExamMonitoring.ts apps/web/lib/hooks/useExamMonitoring.test.tsx apps/web/components/LeaderboardPanel.tsx apps/web/components/LeaderboardPanel.test.tsx "apps/web/app/(recruiter)/exams/[id]/edit/page.tsx"
git commit -m "feat: add recruiter Leaderboard tab with live race-style ranking"
```

---

## Task 7: Candidate frontend — leaderboard widget

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useAttempt.ts`
- Create: `apps/web/app/(candidate)/components/LeaderboardWidget.tsx`
- Create: `apps/web/app/(candidate)/components/LeaderboardWidget.test.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `GET /attempt/leaderboard` (Task 4).
- Produces: `LeaderboardWidget` component, mounted on the candidate exam page.

- [ ] **Step 1: Add the candidate-facing types**

In `apps/web/lib/types.ts`, add:

```ts
export interface CandidateLeaderboardRow {
  rank: number;
  correctCount: number;
  label: string;
  isYou: boolean;
}

export interface CandidateLeaderboardResponse {
  you: { rank: number; correctCount: number } | null;
  top: CandidateLeaderboardRow[];
}
```

- [ ] **Step 2: Add the `useLeaderboard` hook**

In `apps/web/lib/hooks/useAttempt.ts`, add the import:
```ts
import { AttemptCurrent, ProctoringEventType, CandidateLeaderboardResponse } from '../types';
```
(Merge into the existing `import { AttemptCurrent, ProctoringEventType } from '../types';` line rather than duplicating it.)

Add at the end of the file:

```ts
export function useLeaderboard(enabled: boolean) {
  const { accessToken } = useCandidateAuth();
  return useQuery<CandidateLeaderboardResponse>({
    queryKey: ['attempt', 'leaderboard'],
    queryFn: () => candidateApiFetch('/attempt/leaderboard', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && enabled,
    refetchInterval: 5_000,
  });
}
```

- [ ] **Step 3: Write a failing test for `LeaderboardWidget`**

Create `apps/web/app/(candidate)/components/LeaderboardWidget.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as useAttemptModule from '../../../lib/hooks/useAttempt';
import { LeaderboardWidget } from './LeaderboardWidget';

describe('LeaderboardWidget', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows the candidate\'s own rank', () => {
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({
      data: { you: { rank: 12, correctCount: 4 }, top: [] },
      isLoading: false,
    } as any);

    render(<LeaderboardWidget />);

    expect(screen.getByText(/#12/)).toBeInTheDocument();
  });

  it('expands to show the anonymized top list, highlighting the viewer\'s own row', async () => {
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({
      data: {
        you: { rank: 2, correctCount: 4 },
        top: [
          { rank: 1, correctCount: 5, label: 'Candidate 1', isYou: false },
          { rank: 2, correctCount: 4, label: 'You', isYou: true },
        ],
      },
      isLoading: false,
    } as any);

    render(<LeaderboardWidget />);
    await userEvent.click(screen.getByRole('button', { name: /leaderboard/i }));

    expect(screen.getByText('Candidate 1')).toBeInTheDocument();
    expect(screen.getAllByText('You')).toHaveLength(1);
  });

  it('renders nothing while loading with no cached data', () => {
    jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({ data: undefined, isLoading: true } as any);

    const { container } = render(<LeaderboardWidget />);

    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `cd apps/web && npx jest LeaderboardWidget.test.tsx`
Expected: FAIL — `Cannot find module './LeaderboardWidget'`.

- [ ] **Step 5: Implement `LeaderboardWidget`**

Create `apps/web/app/(candidate)/components/LeaderboardWidget.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLeaderboard } from '../../../lib/hooks/useAttempt';

export function LeaderboardWidget() {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useLeaderboard(true);

  if (isLoading && !data) {
    return null;
  }
  if (!data || !data.you) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white text-xs">
      <button
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center justify-between px-3 py-2 font-semibold text-gray-700"
      >
        <span>Leaderboard: #{data.you.rank}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-1 border-t border-gray-100 p-2">
          <AnimatePresence>
            {data.top.map((row) => (
              <motion.li
                key={row.label === 'You' ? 'you' : row.label}
                layout
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className={row.isYou ? 'flex justify-between rounded bg-candidate-primary-light px-2 py-1 font-semibold text-candidate-primary' : 'flex justify-between px-2 py-1 text-gray-600'}
              >
                <span>#{row.rank} {row.label}</span>
                <span>{row.correctCount}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Run to verify pass**

Run: `cd apps/web && npx jest LeaderboardWidget.test.tsx`
Expected: PASS.

- [ ] **Step 7: Mount the widget on the candidate exam page**

In `apps/web/app/(candidate)/exam/page.tsx`, add the import:
```tsx
import { LeaderboardWidget } from '../components/LeaderboardWidget';
```

In the header row (the `<div className="mb-4 flex items-center justify-between ...">` containing the question-nav toggle and the timer badge), add the widget — place it between the question-count span and the timer badge:

```tsx
        <LeaderboardWidget />
```

- [ ] **Step 8: Write a test confirming the widget renders on the exam page**

In `apps/web/app/(candidate)/exam/page.test.tsx`, add `jest.spyOn(useAttemptModule, 'useLeaderboard').mockReturnValue({ data: { you: { rank: 3, correctCount: 2 }, top: [] }, isLoading: false } as any);` to this file's shared `beforeEach` (alongside the other `useAttemptModule` mocks already set up there), then add:

```tsx
  it('shows the leaderboard widget with the candidate\'s current rank', () => {
    jest.spyOn(useAttemptModule, 'useAttemptQuery').mockReturnValue({ data: mockAttempt(), isError: false } as any);

    render(<CandidateExamPage />);

    expect(screen.getByText(/#3/)).toBeInTheDocument();
  });
```

(Reuse this file's existing `mockAttempt()`/render setup rather than duplicating fixture data — check the top of the file for its established helper name and mock shape.)

- [ ] **Step 9: Run to verify pass**

Run: `cd apps/web && npx jest "exam/page.test.tsx"`
Expected: PASS.

- [ ] **Step 10: Run the full frontend suite**

Run: `cd apps/web && npx jest`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useAttempt.ts "apps/web/app/(candidate)/components/LeaderboardWidget.tsx" "apps/web/app/(candidate)/components/LeaderboardWidget.test.tsx" "apps/web/app/(candidate)/exam/page.tsx" "apps/web/app/(candidate)/exam/page.test.tsx"
git commit -m "feat: add candidate-facing anonymized leaderboard widget"
```

---

## Task 8: End-to-end verification

**Files:**
- Modify: `apps/web/e2e/live-monitoring-golden-path.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Extend the live-monitoring golden path with a leaderboard assertion**

Read `apps/web/e2e/live-monitoring-golden-path.spec.ts` in full first — it already logs in a recruiter, creates a question/exam, invites a candidate, and has the candidate start their attempt while the recruiter watches the Live tab update in real time. Reuse its exact setup rather than duplicating it.

Add a new `test(...)` in the same file (after the existing one), following its established structure exactly (recruiter login → create question → create+publish exam → invite candidate → candidate redeems token in a second browser context), then add leaderboard-specific steps at the end:

```ts
  // ... reuse this file's existing setup through "candidate redeems the invite and starts the exam" ...

  await candidatePage.getByRole('button', { name: /True|Yes/ }).first().click(); // select whichever option this file's seeded question uses for its correct answer — check the existing test's question setup for the exact correct-option label
  await candidatePage.waitForTimeout(500); // debounced answer save

  await page.getByRole('tab', { name: 'Leaderboard' }).click();
  await expect(page.getByText(/1$/)).toBeVisible(); // the correct-count "1" appears somewhere in the leaderboard row
```

Adjust the exact locators to match this file's real candidate-page selectors (button roles/labels for the seeded question's options) and recruiter-side tab structure — read the file fully before writing this, don't guess blindly from this plan's illustrative snippet.

- [ ] **Step 2: Run the extended spec**

Run: `cd apps/web && npx playwright test live-monitoring-golden-path`
Expected: PASS.

- [ ] **Step 3: Run the full test suite across all three apps as a final regression check**

Run:
```bash
cd apps/exam-runtime && npx jest
cd ../api && npx jest && npx jest --config test/jest-e2e.json
cd ../web && npx jest && npx playwright test
```
Expected: PASS across the board.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/live-monitoring-golden-path.spec.ts
git commit -m "test: add live-leaderboard e2e coverage to the monitoring golden path"
```
