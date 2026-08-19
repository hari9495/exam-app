# AI Candidate Fit Scoring & Summaries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give recruiters an on-demand AI fit score (0–100) + summary/strengths/concerns per candidate in a job's pipeline, sortable into a ranking, judged against the job (+ optional free-text criteria + optional weighted rubric).

**Architecture:** Reuse the existing async-AI plumbing end to end — a new BullMQ `candidate_fit` processor (mirroring `resume-parse.processor.ts`) resolves the org's AI provider and calls `generateStructured`, writing a new `CandidateFitAssessment` row (one per `PipelineEntry`). A thin `CandidateFitService` triggers scoring (bulk per job + single per entry) via `JobsService.enqueue` and reads assessments back. The pipeline board is extended with fit fields; the drawer gets an "AI Fit" section; the job form gets the criteria + rubric editors. AI network calls happen **outside** any `forTenant` tx.

**Tech Stack:** NestJS 11 + Prisma (Azure SQL Server), BullMQ/Redis, `@exam-platform/shared` (AiApiKeyResolverService, TenantPrismaService, AuditService), Next.js 16 + React Query (apps/web), Jest.

## Global Constraints

- **Advisory only:** a fit score NEVER triggers an automated action (no auto-reject, no stage change, no email). Every score-facing UI shows the advisory line: *"AI-generated guidance — a hiring aid, not a decision. Review the candidate yourself."*
- **Exam results kept separate:** the fit score is résumé/profile-vs-job fit ONLY. The AI prompt does not receive or consider exam scores.
- **Network outside tx:** `generateStructured` (AI call) must run OUTSIDE any `TenantPrismaService.forTenant` callback — three-phase: short read tx → AI call → short write tx. (Same discipline as `resume-parse.processor.ts`.)
- **Inputs:** the AI scores off the parsed `CandidateProfile` fields (`parsedSummary`, `parsedSkills` [JSON string array], `parsedTitle`, `parsedYearsExperience`) — only when `parseStatus === 'done'`. Raw résumé text is not stored and is not re-fetched.
- **One assessment per entry:** `CandidateFitAssessment.entryId` is a non-nullable `@unique`; re-scoring UPDATES the row (upsert).
- **Permissions:** trigger endpoints require `pipeline:manage`; read endpoints require `results:view`.
- **SQL Server migration rules:** `created_at` default = `GETUTCDATE()` (never `CURRENT_TIMESTAMP`); RLS `ALTER SECURITY POLICY` goes in a SEPARATE migration from `CREATE TABLE`; the new table's only FK is to `pipeline_entries` (`ON DELETE CASCADE`) — NO FK to organizations/users/candidates/jobs (plain columns under RLS, avoids P1012 multiple-cascade-path); `Job.fit_criteria`/`fit_rubric` are additive `ALTER TABLE ADD` (nullable, no same-batch reference → no EXEC-wrap).
- **Status vocabulary** (`CandidateFitAssessment.status`): `pending | processing | done | failed | skipped_no_resume | skipped_no_ai_key`.
- **GDPR:** candidate erase scrubs the candidate's assessment PII (`summary`, `strengths`, `concerns`, `dimensionScores` → null).
- **Deferred:** comparative whole-pool AI ranking pass (not built — ranking = sort by independent score).

---

### Task 1: Schema + migrations

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add `CandidateFitAssessment` model; add two fields to `Job`)
- Create: `apps/api/prisma/migrations/20260825090000_candidate_fit/migration.sql`
- Create: `apps/api/prisma/migrations/20260825090001_candidate_fit_rls/migration.sql`

**Interfaces:**
- Produces: Prisma model `CandidateFitAssessment` and fields `Job.fitCriteria`, `Job.fitRubric` used by all later backend tasks.

- [ ] **Step 1: Add the model + Job fields to `schema.prisma`**

Add to the `Job` model (alongside its existing fields):

```prisma
  fitCriteria String? @map("fit_criteria") @db.NVarChar(Max)
  fitRubric   String? @map("fit_rubric") @db.NVarChar(Max)
```

Add a new model:

```prisma
model CandidateFitAssessment {
  id              String    @id @default(uuid()) @db.UniqueIdentifier
  organizationId  String    @map("organization_id") @db.UniqueIdentifier
  entryId         String    @unique @map("entry_id") @db.UniqueIdentifier
  jobId           String    @map("job_id") @db.UniqueIdentifier
  candidateId     String    @map("candidate_id") @db.UniqueIdentifier
  status          String    @default("pending")
  overallScore    Int?      @map("overall_score")
  summary         String?   @db.NVarChar(Max)
  strengths       String?   @db.NVarChar(Max)
  concerns        String?   @db.NVarChar(Max)
  dimensionScores String?   @map("dimension_scores") @db.NVarChar(Max)
  criteriaHash    String?   @map("criteria_hash")
  modelUsed       String?   @map("model_used")
  scoredByUserId  String?   @map("scored_by_user_id") @db.UniqueIdentifier
  scoredAt        DateTime? @map("scored_at")
  aiJobId         String?   @map("ai_job_id") @db.UniqueIdentifier
  error           String?   @db.NVarChar(Max)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  entry PipelineEntry @relation(fields: [entryId], references: [id], onDelete: Cascade)

  @@index([organizationId, jobId])
  @@map("candidate_fit_assessments")
}
```

Add the back-relation to the `PipelineEntry` model (alongside its existing relations like `offers`, `interviews`):

```prisma
  fitAssessment CandidateFitAssessment?
```

- [ ] **Step 2: Write the CREATE TABLE migration**

`apps/api/prisma/migrations/20260825090000_candidate_fit/migration.sql`:

```sql
-- AlterTable: additive nullable job criteria (no same-batch reference -> no EXEC-wrap needed)
ALTER TABLE [dbo].[jobs] ADD [fit_criteria] NVARCHAR(MAX), [fit_rubric] NVARCHAR(MAX);

-- CreateTable
CREATE TABLE [dbo].[candidate_fit_assessments] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [entry_id] UNIQUEIDENTIFIER NOT NULL,
    [job_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [candidate_fit_assessments_status_df] DEFAULT 'pending',
    [overall_score] INT,
    [summary] NVARCHAR(MAX),
    [strengths] NVARCHAR(MAX),
    [concerns] NVARCHAR(MAX),
    [dimension_scores] NVARCHAR(MAX),
    [criteria_hash] NVARCHAR(1000),
    [model_used] NVARCHAR(1000),
    [scored_by_user_id] UNIQUEIDENTIFIER,
    [scored_at] DATETIME2,
    [ai_job_id] UNIQUEIDENTIFIER,
    [error] NVARCHAR(MAX),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_fit_assessments_created_at_df] DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [candidate_fit_assessments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [candidate_fit_assessments_entry_id_key] UNIQUE NONCLUSTERED ([entry_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_fit_assessments_organization_id_job_id_idx] ON [dbo].[candidate_fit_assessments]([organization_id], [job_id]);

-- AddForeignKey (only FK: to pipeline_entries, single cascade path)
ALTER TABLE [dbo].[candidate_fit_assessments] ADD CONSTRAINT [candidate_fit_assessments_entry_id_fkey] FOREIGN KEY ([entry_id]) REFERENCES [dbo].[pipeline_entries]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;
```

- [ ] **Step 3: Write the RLS migration**

`apps/api/prisma/migrations/20260825090001_candidate_fit_rls/migration.sql`:

```sql
-- Extend the tenant isolation policy to the new table (same pattern as 20260823090001_interviews_rls).
-- Separate migration: ALTER SECURITY POLICY cannot run in the same batch as CREATE TABLE.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_fit_assessments,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_fit_assessments AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_fit_assessments AFTER UPDATE;
```

- [ ] **Step 4: Regenerate the client and typecheck**

Run: `cd apps/api && npx prisma generate && npx prisma validate`
Expected: "The schema at prisma/schema.prisma is valid 🚀" and client regenerates with no error.

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: clean (the new model types compile).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260825090000_candidate_fit apps/api/prisma/migrations/20260825090001_candidate_fit_rls
git commit -m "feat(candidate-fit): CandidateFitAssessment model + Job criteria fields + RLS migration"
```

---

### Task 2: Pure fit-scoring core

Pure functions — no NestJS, no Prisma, no I/O. The heart of the feature's correctness (schema, validation, hashing, rubric rules).

**Files:**
- Create: `apps/api/src/candidate-fit/candidate-fit.core.ts`
- Test: `apps/api/src/candidate-fit/candidate-fit.core.spec.ts`

**Interfaces:**
- Produces (consumed by Tasks 3, 4, 7):
  - `interface RubricDimension { label: string; weight: number }`
  - `interface FitResult { overallScore: number; summary: string; strengths: string[]; concerns: string[]; dimensionScores: { label: string; weight: number; score: number }[] | null }`
  - `interface FitJobInput { title: string; description: string | null; fitCriteria: string | null; fitRubric: string | null }`
  - `interface FitProfileInput { parsedSummary: string | null; parsedSkills: string[]; parsedTitle: string | null; parsedYearsExperience: number | null }`
  - `parseRubric(fitRubric: string | null): RubricDimension[]` — tolerant read of stored JSON; `[]` when null/blank/malformed.
  - `validateRubricInput(dims: unknown): RubricDimension[]` — throws `Error` when invalid; returns normalized dims (used by updateJob).
  - `computeCriteriaHash(job: FitJobInput): string` — sha256 hex.
  - `buildFitToolSchema(rubric: RubricDimension[]): object` — the `generateStructured` tool schema; requests `dimensionScores` only when `rubric.length > 0`.
  - `buildFitPrompt(job: FitJobInput, profile: FitProfileInput, rubric: RubricDimension[]): string`
  - `validateFitResult(raw: Record<string, unknown>, rubric: RubricDimension[]): FitResult` — clamps/validates; throws `Error` on malformed.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/candidate-fit/candidate-fit.core.spec.ts`:

```ts
import {
  parseRubric,
  validateRubricInput,
  computeCriteriaHash,
  buildFitToolSchema,
  buildFitPrompt,
  validateFitResult,
  RubricDimension,
} from './candidate-fit.core';

describe('candidate-fit.core', () => {
  const job = { title: 'Backend Engineer', description: 'Build APIs', fitCriteria: null, fitRubric: null };
  const profile = { parsedSummary: 'Senior dev', parsedSkills: ['Node', 'SQL'], parsedTitle: 'Engineer', parsedYearsExperience: 6 };

  describe('parseRubric', () => {
    it('returns [] for null / blank / malformed', () => {
      expect(parseRubric(null)).toEqual([]);
      expect(parseRubric('')).toEqual([]);
      expect(parseRubric('not json')).toEqual([]);
      expect(parseRubric('{}')).toEqual([]);
    });
    it('parses a valid rubric array', () => {
      expect(parseRubric('[{"label":"Python","weight":60},{"label":"AWS","weight":40}]')).toEqual([
        { label: 'Python', weight: 60 },
        { label: 'AWS', weight: 40 },
      ]);
    });
    it('drops entries with a non-string label or non-number weight', () => {
      expect(parseRubric('[{"label":"OK","weight":100},{"label":5,"weight":"x"}]')).toEqual([{ label: 'OK', weight: 100 }]);
    });
  });

  describe('validateRubricInput', () => {
    it('accepts an empty list (no rubric)', () => {
      expect(validateRubricInput([])).toEqual([]);
    });
    it('accepts weights summing to 100', () => {
      expect(validateRubricInput([{ label: 'A', weight: 70 }, { label: 'B', weight: 30 }])).toHaveLength(2);
    });
    it('rejects weights not summing to 100', () => {
      expect(() => validateRubricInput([{ label: 'A', weight: 50 }])).toThrow(/sum to 100/i);
    });
    it('rejects an empty label', () => {
      expect(() => validateRubricInput([{ label: '  ', weight: 100 }])).toThrow(/label/i);
    });
    it('rejects a non-integer / negative weight', () => {
      expect(() => validateRubricInput([{ label: 'A', weight: 33.3 }, { label: 'B', weight: 66.7 }])).toThrow(/integer/i);
      expect(() => validateRubricInput([{ label: 'A', weight: -5 }, { label: 'B', weight: 105 }])).toThrow();
    });
  });

  describe('computeCriteriaHash', () => {
    it('is stable for the same inputs and changes when title/description/criteria/rubric change', () => {
      const base = computeCriteriaHash(job);
      expect(computeCriteriaHash(job)).toBe(base);
      expect(computeCriteriaHash({ ...job, title: 'Frontend Engineer' })).not.toBe(base);
      expect(computeCriteriaHash({ ...job, description: 'Other' })).not.toBe(base);
      expect(computeCriteriaHash({ ...job, fitCriteria: 'Must know Rust' })).not.toBe(base);
      expect(computeCriteriaHash({ ...job, fitRubric: '[{"label":"A","weight":100}]' })).not.toBe(base);
    });
  });

  describe('buildFitToolSchema', () => {
    it('omits dimensionScores when there is no rubric', () => {
      const schema = buildFitToolSchema([]) as any;
      expect(schema.properties.dimensionScores).toBeUndefined();
      expect(schema.required).toContain('overallScore');
    });
    it('includes dimensionScores when a rubric exists', () => {
      const schema = buildFitToolSchema([{ label: 'Python', weight: 100 }]) as any;
      expect(schema.properties.dimensionScores).toBeDefined();
    });
  });

  describe('buildFitPrompt', () => {
    it('includes job + profile, and the rubric labels when present, but never an exam score', () => {
      const prompt = buildFitPrompt(
        { ...job, fitCriteria: 'Ship fast', fitRubric: '[{"label":"Python","weight":100}]' },
        profile,
        [{ label: 'Python', weight: 100 }],
      );
      expect(prompt).toContain('Backend Engineer');
      expect(prompt).toContain('Ship fast');
      expect(prompt).toContain('Python');
      expect(prompt).toContain('Senior dev');
      expect(prompt.toLowerCase()).toContain('do not');
      expect(prompt.toLowerCase()).not.toContain('exam score');
    });
  });

  describe('validateFitResult', () => {
    const good = { overallScore: 82, summary: 'Strong', strengths: ['a'], concerns: ['b'] };
    it('accepts a well-formed result with no rubric (dimensionScores null)', () => {
      const r = validateFitResult(good, []);
      expect(r).toEqual({ overallScore: 82, summary: 'Strong', strengths: ['a'], concerns: ['b'], dimensionScores: null });
    });
    it('clamps overallScore into 0..100', () => {
      expect(validateFitResult({ ...good, overallScore: 140 }, []).overallScore).toBe(100);
      expect(validateFitResult({ ...good, overallScore: -3 }, []).overallScore).toBe(0);
    });
    it('throws when summary is missing/not a string', () => {
      expect(() => validateFitResult({ ...good, summary: 5 }, [])).toThrow(/malformed/i);
    });
    it('merges rubric weights into dimensionScores and clamps each score', () => {
      const rubric: RubricDimension[] = [{ label: 'Python', weight: 70 }, { label: 'AWS', weight: 30 }];
      const raw = { ...good, dimensionScores: [{ label: 'Python', score: 90 }, { label: 'AWS', score: 250 }] };
      expect(validateFitResult(raw, rubric).dimensionScores).toEqual([
        { label: 'Python', weight: 70, score: 90 },
        { label: 'AWS', weight: 30, score: 100 },
      ]);
    });
    it('fills a missing dimension score with 0 rather than throwing', () => {
      const rubric: RubricDimension[] = [{ label: 'Python', weight: 100 }];
      const raw = { ...good, dimensionScores: [] };
      expect(validateFitResult(raw, rubric).dimensionScores).toEqual([{ label: 'Python', weight: 100, score: 0 }]);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest src/candidate-fit/candidate-fit.core.spec.ts`
Expected: FAIL — `Cannot find module './candidate-fit.core'`.

- [ ] **Step 3: Implement the core**

`apps/api/src/candidate-fit/candidate-fit.core.ts`:

```ts
import { createHash } from 'crypto';

export interface RubricDimension {
  label: string;
  weight: number;
}

export interface FitResult {
  overallScore: number;
  summary: string;
  strengths: string[];
  concerns: string[];
  dimensionScores: { label: string; weight: number; score: number }[] | null;
}

export interface FitJobInput {
  title: string;
  description: string | null;
  fitCriteria: string | null;
  fitRubric: string | null;
}

export interface FitProfileInput {
  parsedSummary: string | null;
  parsedSkills: string[];
  parsedTitle: string | null;
  parsedYearsExperience: number | null;
}

function clampScore(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// Tolerant read of a stored rubric: never throws, drops anything malformed.
export function parseRubric(fitRubric: string | null): RubricDimension[] {
  if (!fitRubric) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(fitRubric);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (d): d is RubricDimension =>
        !!d && typeof (d as any).label === 'string' && typeof (d as any).weight === 'number',
    )
    .map((d) => ({ label: d.label, weight: d.weight }));
}

// Strict validation for recruiter-submitted rubric input. Empty = "no rubric" and is allowed.
export function validateRubricInput(dims: unknown): RubricDimension[] {
  if (!Array.isArray(dims)) throw new Error('Rubric must be an array');
  if (dims.length === 0) return [];
  const normalized: RubricDimension[] = dims.map((d: any) => {
    if (!d || typeof d.label !== 'string' || !d.label.trim()) throw new Error('Each rubric dimension needs a non-empty label');
    if (typeof d.weight !== 'number' || !Number.isInteger(d.weight) || d.weight < 0) {
      throw new Error('Each rubric weight must be a non-negative integer');
    }
    return { label: d.label.trim(), weight: d.weight };
  });
  const sum = normalized.reduce((a, d) => a + d.weight, 0);
  if (sum !== 100) throw new Error('Rubric weights must sum to 100');
  return normalized;
}

export function computeCriteriaHash(job: FitJobInput): string {
  const material = [job.title, job.description ?? '', job.fitCriteria ?? '', job.fitRubric ?? ''].join('\n');
  return createHash('sha256').update(material).digest('hex');
}

export function buildFitToolSchema(rubric: RubricDimension[]): object {
  const properties: Record<string, unknown> = {
    overallScore: { type: 'integer', description: 'Overall résumé-vs-role fit, 0 (no fit) to 100 (excellent fit).' },
    summary: { type: 'string', description: 'A 2-4 sentence narrative of how well the candidate fits this role.' },
    strengths: { type: 'array', items: { type: 'string' }, description: 'Concise, specific strengths for this role.' },
    concerns: { type: 'array', items: { type: 'string' }, description: 'Concise, specific gaps or concerns for this role.' },
  };
  if (rubric.length > 0) {
    properties.dimensionScores = {
      type: 'array',
      description: 'One entry per named rubric dimension, each scored 0-100.',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'The rubric dimension label (echo it back exactly).' },
          score: { type: 'integer', description: 'Fit for this dimension, 0-100.' },
        },
        required: ['label', 'score'],
      },
    };
  }
  return { type: 'object', properties, required: ['overallScore', 'summary', 'strengths', 'concerns'] };
}

export function buildFitPrompt(job: FitJobInput, profile: FitProfileInput, rubric: RubricDimension[]): string {
  const parts: string[] = [];
  parts.push('You are helping a recruiter assess how well a candidate fits a specific role, based ONLY on the candidate\'s résumé profile.');
  parts.push('Score résumé and experience fit against the role. Do not consider, invent, or reference any test/exam/assessment performance — you are not given it.');
  parts.push(`\n# Role\nTitle: ${job.title}\nDescription: ${job.description ?? '(none provided)'}`);
  if (job.fitCriteria && job.fitCriteria.trim()) {
    parts.push(`\n# What the recruiter is specifically looking for\n${job.fitCriteria.trim()}`);
  }
  if (rubric.length > 0) {
    const lines = rubric.map((d) => `- ${d.label} (weight ${d.weight}%)`).join('\n');
    parts.push(`\n# Scoring rubric — return a per-dimension score (0-100) for each, echoing the label exactly\n${lines}`);
  }
  parts.push(
    `\n# Candidate profile (parsed from résumé)\n` +
      `Title: ${profile.parsedTitle ?? '(unknown)'}\n` +
      `Years of experience: ${profile.parsedYearsExperience ?? '(unknown)'}\n` +
      `Skills: ${profile.parsedSkills.length ? profile.parsedSkills.join(', ') : '(none extracted)'}\n` +
      `Summary: ${profile.parsedSummary ?? '(none)'}`,
  );
  parts.push('\nBe specific and evidence-based. Keep strengths and concerns to concise bullet points.');
  return parts.join('\n');
}

export function validateFitResult(raw: Record<string, unknown>, rubric: RubricDimension[]): FitResult {
  if (typeof raw.summary !== 'string') throw new Error('AI provider returned a malformed fit result (summary)');
  const strengths = Array.isArray(raw.strengths) ? raw.strengths.filter((s): s is string => typeof s === 'string') : [];
  const concerns = Array.isArray(raw.concerns) ? raw.concerns.filter((s): s is string => typeof s === 'string') : [];

  let dimensionScores: FitResult['dimensionScores'] = null;
  if (rubric.length > 0) {
    const byLabel = new Map<string, number>();
    if (Array.isArray(raw.dimensionScores)) {
      for (const d of raw.dimensionScores as any[]) {
        if (d && typeof d.label === 'string') byLabel.set(d.label, clampScore(d.score));
      }
    }
    // Drive off the rubric (authoritative weights), fill a missing score with 0.
    dimensionScores = rubric.map((r) => ({ label: r.label, weight: r.weight, score: byLabel.get(r.label) ?? 0 }));
  }

  return {
    overallScore: clampScore(raw.overallScore),
    summary: raw.summary,
    strengths,
    concerns,
    dimensionScores,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest src/candidate-fit/candidate-fit.core.spec.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidate-fit/candidate-fit.core.ts apps/api/src/candidate-fit/candidate-fit.core.spec.ts
git commit -m "feat(candidate-fit): pure scoring core — schema, prompt, validation, criteria hash, rubric rules"
```

---

### Task 3: The `candidate_fit` processor

Mirrors `apps/api/src/jobs/processors/resume-parse.processor.ts`. Runs in the BullMQ worker; the AI call is outside the tenant tx.

**Files:**
- Create: `apps/api/src/jobs/processors/candidate-fit.processor.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts` (register the processor + add it to `AI_JOB_PROCESSORS`)
- Test: `apps/api/src/jobs/processors/candidate-fit.processor.spec.ts`

**Interfaces:**
- Consumes: `AiApiKeyResolverService.resolve(orgId): Promise<AiProvider>` (throws `AiNotConfiguredError` when unset); `AiProvider.generateStructured({ modelTier, maxTokens, prompt, tool })`; `TenantPrismaService.forTenant`; `AuditService.record(context, { actorUserId, action, entityType, entityId })`; core functions from Task 2.
- Produces: `CandidateFitProcessor` with `type = 'candidate_fit'`; input shape `{ entryId: string }`. Consumed by the worker + Task 4 (which enqueues it) + Task 5 module wiring.

- [ ] **Step 1: Write the failing test**

`apps/api/src/jobs/processors/candidate-fit.processor.spec.ts`:

```ts
import { CandidateFitProcessor } from './candidate-fit.processor';

describe('CandidateFitProcessor', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const aiJobId = 'aijob-1';
  let tx: any;
  let tenantPrisma: any;
  let aiResolver: any;
  let audit: any;
  let provider: any;
  let processor: CandidateFitProcessor;
  const callOrder: string[] = [];

  const entry = { id: 'entry-1', jobId: 'job-1', candidateId: 'cand-1', organizationId: 'org-1' };
  const job = { id: 'job-1', title: 'Backend Eng', description: 'APIs', fitCriteria: null, fitRubric: null };
  const profile = { candidateId: 'cand-1', parseStatus: 'done', parsedSummary: 'Senior', parsedSkills: '["Node"]', parsedTitle: 'Eng', parsedYearsExperience: 6 };

  beforeEach(() => {
    callOrder.length = 0;
    tx = {
      pipelineEntry: { findFirst: jest.fn().mockResolvedValue(entry) },
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      candidateProfile: { findFirst: jest.fn().mockResolvedValue(profile) },
      aiJob: { findUnique: jest.fn().mockResolvedValue({ id: aiJobId, createdBy: 'user-9' }) },
      candidateFitAssessment: { update: jest.fn().mockResolvedValue({}), upsert: jest.fn().mockResolvedValue({}) },
      aiCreditUsage: { create: jest.fn().mockResolvedValue({}) },
    };
    tenantPrisma = {
      forTenant: jest.fn(async (_ctx: any, fn: any) => {
        callOrder.push('forTenant');
        return fn(tx);
      }),
    };
    provider = {
      generateStructured: jest.fn(async () => {
        callOrder.push('ai');
        return { overallScore: 80, summary: 'Good fit', strengths: ['Node'], concerns: ['No AWS'] };
      }),
    };
    aiResolver = { resolve: jest.fn().mockResolvedValue(provider) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    processor = new CandidateFitProcessor(tenantPrisma, aiResolver, audit);
  });

  it('has type candidate_fit', () => {
    expect(processor.type).toBe('candidate_fit');
  });

  it('writes a done assessment with score/summary, credit usage, and an audit stamped with the enqueuing user', async () => {
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);

    const update = tx.candidateFitAssessment.update.mock.calls.at(-1)[0];
    expect(update.where).toEqual({ entryId: 'entry-1' });
    expect(update.data).toMatchObject({ status: 'done', overallScore: 80, summary: 'Good fit', scoredByUserId: 'user-9', aiJobId });
    expect(JSON.parse(update.data.strengths)).toEqual(['Node']);
    expect(tx.aiCreditUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'candidate_fit', sourceId: 'entry-1' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      expect.objectContaining({ actorUserId: 'user-9', action: 'candidate_fit.scored', entityType: 'candidate_fit_assessment', entityId: 'entry-1' }),
    );
  });

  it('runs the AI call OUTSIDE every forTenant tx', async () => {
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    const firstAi = callOrder.indexOf('ai');
    const lastForTenantBeforeAi = callOrder.lastIndexOf('forTenant', firstAi);
    const forTenantAfterAi = callOrder.indexOf('forTenant', firstAi);
    // there is at least one read forTenant before the AI call and one write forTenant after it,
    // and the AI call itself is not nested inside a forTenant callback (it appears between them)
    expect(lastForTenantBeforeAi).toBeGreaterThanOrEqual(0);
    expect(forTenantAfterAi).toBeGreaterThan(firstAi);
  });

  it('marks skipped_no_resume when the candidate has no parsed profile, without calling the AI', async () => {
    tx.candidateProfile.findFirst.mockResolvedValue({ ...profile, parseStatus: 'pending' });
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    expect(provider.generateStructured).not.toHaveBeenCalled();
    expect(tx.candidateFitAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'skipped_no_resume' }) }));
  });

  it('marks skipped_no_ai_key when the org has no AI provider, without failing', async () => {
    const { AiNotConfiguredError } = require('@exam-platform/shared');
    aiResolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    expect(tx.candidateFitAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'skipped_no_ai_key' }) }));
  });

  it('marks failed on a malformed AI response', async () => {
    provider.generateStructured.mockResolvedValue({ overallScore: 50 }); // missing summary
    await processor.process({ entryId: 'entry-1' }, context, aiJobId);
    expect(tx.candidateFitAssessment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/jobs/processors/candidate-fit.processor.spec.ts`
Expected: FAIL — `Cannot find module './candidate-fit.processor'`.

- [ ] **Step 3: Implement the processor**

`apps/api/src/jobs/processors/candidate-fit.processor.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import {
  TenantContext,
  TenantPrismaService,
  AiApiKeyResolverService,
  AiNotConfiguredError,
  AiProvider,
  AuditService,
} from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import {
  parseRubric,
  buildFitToolSchema,
  buildFitPrompt,
  validateFitResult,
  computeCriteriaHash,
  FitResult,
} from '../../candidate-fit/candidate-fit.core';

interface CandidateFitInput {
  entryId: string;
}

@Injectable()
export class CandidateFitProcessor implements JobProcessor {
  readonly type = 'candidate_fit';
  private readonly logger = new Logger(CandidateFitProcessor.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly audit: AuditService,
  ) {}

  async process(input: unknown, context: TenantContext, aiJobId: string): Promise<unknown> {
    const { entryId } = input as CandidateFitInput;

    // Phase 1: read entry + job + profile (+ the enqueuing user, carried on the AiJob row).
    const loaded = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: context.organizationId as string } });
      if (!entry) return null;
      const job = await tx.job.findFirst({ where: { id: entry.jobId, organizationId: context.organizationId as string } });
      const profile = await tx.candidateProfile.findFirst({ where: { candidateId: entry.candidateId, organizationId: context.organizationId as string } });
      const aiJob = await tx.aiJob.findUnique({ where: { id: aiJobId } });
      return { entry, job, profile, scoredByUserId: aiJob?.createdBy ?? null };
    });

    if (!loaded || !loaded.job) {
      // The entry (or its job) vanished between enqueue and processing — nothing to score.
      return { ok: false, status: 'skipped_no_resume' };
    }
    const { entry, job, profile, scoredByUserId } = loaded;

    if (!profile || profile.parseStatus !== 'done') {
      await this.setStatus(context, entryId, 'skipped_no_resume');
      return { ok: false, status: 'skipped_no_resume' };
    }

    // Resolve the provider as its own step so a MISSING key is recorded distinctly from a genuine
    // failure (retrying can never fix a missing key) — same reasoning as ResumeParseProcessor.
    const aiProvider = await this.aiApiKeyResolver.resolve(context.organizationId as string).catch((error) => {
      if (error instanceof AiNotConfiguredError) return null;
      throw error;
    });
    if (!aiProvider) {
      await this.setStatus(context, entryId, 'skipped_no_ai_key');
      return { ok: false, status: 'skipped_no_ai_key' };
    }

    try {
      const rubric = parseRubric(job.fitRubric);
      const jobInput = { title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric };
      const profileInput = {
        parsedSummary: profile.parsedSummary,
        parsedSkills: safeSkills(profile.parsedSkills),
        parsedTitle: profile.parsedTitle,
        parsedYearsExperience: profile.parsedYearsExperience,
      };

      // Phase 2: AI call — OUTSIDE any forTenant tx.
      const result = await this.callAi(aiProvider, jobInput, profileInput, rubric);

      // Phase 3: persist done + credit usage + audit.
      const criteriaHash = computeCriteriaHash(jobInput);
      await this.tenantPrisma.forTenant(context, async (tx) => {
        await tx.candidateFitAssessment.update({
          where: { entryId },
          data: {
            status: 'done',
            overallScore: result.overallScore,
            summary: result.summary,
            strengths: JSON.stringify(result.strengths),
            concerns: JSON.stringify(result.concerns),
            dimensionScores: result.dimensionScores ? JSON.stringify(result.dimensionScores) : null,
            criteriaHash,
            modelUsed: 'standard',
            scoredByUserId,
            scoredAt: new Date(),
            aiJobId,
            error: null,
          },
        });
        await tx.aiCreditUsage.create({
          data: { organizationId: context.organizationId as string, source: 'candidate_fit', credits: 1, sourceId: entryId },
        });
      });
      await this.audit.record(context, {
        actorUserId: scoredByUserId,
        action: 'candidate_fit.scored',
        entityType: 'candidate_fit_assessment',
        entityId: entryId,
      });
      return { ok: true, overallScore: result.overallScore };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Candidate fit scoring failed for entry ${entryId} (job ${aiJobId}): ${message}`);
      await this.setStatus(context, entryId, 'failed', message);
      return { ok: false, status: 'failed' };
    }
  }

  private async callAi(
    aiProvider: AiProvider,
    job: { title: string; description: string | null; fitCriteria: string | null; fitRubric: string | null },
    profile: { parsedSummary: string | null; parsedSkills: string[]; parsedTitle: string | null; parsedYearsExperience: number | null },
    rubric: { label: string; weight: number }[],
  ): Promise<FitResult> {
    const raw = await aiProvider.generateStructured({
      modelTier: 'standard',
      maxTokens: 1024,
      prompt: buildFitPrompt(job, profile, rubric),
      tool: {
        name: 'report_candidate_fit',
        description: 'Report how well the candidate fits this specific role.',
        schema: buildFitToolSchema(rubric),
      },
    });
    return validateFitResult(raw, rubric);
  }

  private setStatus(context: TenantContext, entryId: string, status: string, error?: string) {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateFitAssessment.update({ where: { entryId }, data: { status, error: error ?? null } }),
    );
  }
}

function safeSkills(parsedSkills: string | null): string[] {
  if (!parsedSkills) return [];
  try {
    const arr = JSON.parse(parsedSkills);
    return Array.isArray(arr) ? arr.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Register the processor in `jobs.module.ts`**

Add the import near the other processor imports:

```ts
import { CandidateFitProcessor } from './processors/candidate-fit.processor';
```

Add `CandidateFitProcessor` to the `providers` list (alongside `ResumeParseProcessor`), add it to the `AI_JOB_PROCESSORS` factory signature + returned array + `inject` list:

```ts
    {
      provide: AI_JOB_PROCESSORS,
      useFactory: (
        echo: EchoProcessor,
        aiQuestionGeneration: AiQuestionGenerationProcessor,
        resumeParse: ResumeParseProcessor,
        candidateFit: CandidateFitProcessor,
      ) => [echo, aiQuestionGeneration, resumeParse, candidateFit],
      inject: [EchoProcessor, AiQuestionGenerationProcessor, ResumeParseProcessor, CandidateFitProcessor],
    },
```

**Note:** the processor injects `AuditService`. If Nest fails to resolve it in `JobsModule` at boot (it's provided by `@exam-platform/shared`), add the shared module that provides `AuditService` to `JobsModule`'s `imports` — check how `PipelineModule` obtains `AuditService` and mirror it. Confirm boot with `cd apps/api && npx jest src/jobs/processors/candidate-fit.processor.spec.ts` (unit test uses a mock, so it passes regardless; the DI check is Step 6's build/boot).

- [ ] **Step 5: Run the processor tests**

Run: `cd apps/api && npx jest src/jobs/processors/candidate-fit.processor.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 6: Build to confirm module wiring compiles**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/jobs/processors/candidate-fit.processor.ts apps/api/src/jobs/processors/candidate-fit.processor.spec.ts apps/api/src/jobs/jobs.module.ts
git commit -m "feat(candidate-fit): candidate_fit BullMQ processor + module registration"
```

---

### Task 4: `CandidateFitService` — trigger + read

**Files:**
- Create: `apps/api/src/candidate-fit/candidate-fit.service.ts`
- Test: `apps/api/src/candidate-fit/candidate-fit.service.spec.ts`

**Interfaces:**
- Consumes: `JobsService.enqueue(context, type, inputJson, userId): Promise<AiJob>`; `TenantPrismaService.forTenant`; `computeCriteriaHash` from Task 2.
- Produces (consumed by Task 5 controller):
  - `scoreEntry(context, userId, entryId): Promise<{ status: string }>` — single trigger / re-score.
  - `scoreJob(context, userId, jobId): Promise<{ queued: number; skipped: number }>` — bulk.
  - `getForEntry(context, entryId): Promise<FitAssessmentView | null>` where `FitAssessmentView` = the row's public fields + `stale: boolean`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/candidate-fit/candidate-fit.service.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { CandidateFitService } from './candidate-fit.service';
import { computeCriteriaHash } from './candidate-fit.core';

describe('CandidateFitService', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  let tx: any;
  let tenantPrisma: any;
  let jobsService: any;
  let service: CandidateFitService;

  const job = { id: 'job-1', title: 'Eng', description: 'd', fitCriteria: null, fitRubric: null, organizationId: 'org-1' };

  beforeEach(() => {
    tx = {
      job: { findFirst: jest.fn().mockResolvedValue(job) },
      pipelineEntry: {
        findFirst: jest.fn().mockResolvedValue({ id: 'entry-1', jobId: 'job-1', candidateId: 'cand-1', organizationId: 'org-1' }),
        findMany: jest.fn(),
      },
      candidateProfile: { findMany: jest.fn(), findFirst: jest.fn().mockResolvedValue({ parseStatus: 'done' }) },
      candidateFitAssessment: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    jobsService = { enqueue: jest.fn().mockResolvedValue({ id: 'aijob-1' }) };
    service = new CandidateFitService(tenantPrisma, jobsService);
  });

  describe('scoreEntry', () => {
    it('upserts a pending assessment and enqueues a candidate_fit job', async () => {
      const out = await service.scoreEntry(context, 'user-1', 'entry-1');
      expect(tx.candidateFitAssessment.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { entryId: 'entry-1' }, update: expect.objectContaining({ status: 'pending' }) }),
      );
      expect(jobsService.enqueue).toHaveBeenCalledWith(context, 'candidate_fit', JSON.stringify({ entryId: 'entry-1' }), 'user-1');
      expect(out).toEqual({ status: 'pending' });
    });

    it('records skipped_no_resume and does NOT enqueue when there is no parsed profile', async () => {
      tx.candidateProfile.findFirst.mockResolvedValue({ parseStatus: 'pending' });
      const out = await service.scoreEntry(context, 'user-1', 'entry-1');
      expect(jobsService.enqueue).not.toHaveBeenCalled();
      expect(out).toEqual({ status: 'skipped_no_resume' });
    });

    it('404s when the entry does not exist in this org', async () => {
      tx.pipelineEntry.findFirst.mockResolvedValue(null);
      await expect(service.scoreEntry(context, 'user-1', 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('scoreJob', () => {
    it('enqueues one job per eligible entry, skips no-résumé and in-flight, returns counts', async () => {
      tx.pipelineEntry.findMany.mockResolvedValue([
        { id: 'e1', candidateId: 'c1', jobId: 'job-1' },
        { id: 'e2', candidateId: 'c2', jobId: 'job-1' }, // no résumé
        { id: 'e3', candidateId: 'c3', jobId: 'job-1' }, // in-flight
      ]);
      tx.candidateProfile.findMany.mockResolvedValue([
        { candidateId: 'c1', parseStatus: 'done' },
        { candidateId: 'c2', parseStatus: 'pending' },
        { candidateId: 'c3', parseStatus: 'done' },
      ]);
      tx.candidateFitAssessment.findMany.mockResolvedValue([{ entryId: 'e3', status: 'processing' }]);

      const out = await service.scoreJob(context, 'user-1', 'job-1');
      expect(jobsService.enqueue).toHaveBeenCalledTimes(1);
      expect(jobsService.enqueue).toHaveBeenCalledWith(context, 'candidate_fit', JSON.stringify({ entryId: 'e1' }), 'user-1');
      // e2 gets a skipped_no_resume row, e3 is left alone
      expect(out).toEqual({ queued: 1, skipped: 1 });
    });
  });

  describe('getForEntry', () => {
    it('returns null when no assessment exists', async () => {
      expect(await service.getForEntry(context, 'entry-1')).toBeNull();
    });
    it('flags stale=true when the job criteria hash has changed since scoring', async () => {
      tx.candidateFitAssessment.findFirst.mockResolvedValue({
        entryId: 'entry-1', jobId: 'job-1', status: 'done', overallScore: 80,
        summary: 's', strengths: '["a"]', concerns: '["b"]', dimensionScores: null,
        criteriaHash: 'OLD', scoredAt: new Date(), error: null,
      });
      const view = await service.getForEntry(context, 'entry-1');
      const currentHash = computeCriteriaHash({ title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric });
      expect(view!.stale).toBe('OLD' !== currentHash);
      expect(view!.strengths).toEqual(['a']);
      expect(view!.overallScore).toBe(80);
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/candidate-fit/candidate-fit.service.spec.ts`
Expected: FAIL — `Cannot find module './candidate-fit.service'`.

- [ ] **Step 3: Implement the service**

`apps/api/src/candidate-fit/candidate-fit.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';
import { computeCriteriaHash } from './candidate-fit.core';

const IN_FLIGHT = ['pending', 'processing'];

export interface FitAssessmentView {
  entryId: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  strengths: string[];
  concerns: string[];
  dimensionScores: { label: string; weight: number; score: number }[] | null;
  scoredAt: Date | null;
  error: string | null;
  stale: boolean;
}

@Injectable()
export class CandidateFitService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jobs: JobsService,
  ) {}

  async scoreEntry(context: TenantContext, userId: string, entryId: string): Promise<{ status: string }> {
    const orgId = context.organizationId as string;
    const eligible = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId } });
      if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
      const profile = await tx.candidateProfile.findFirst({ where: { candidateId: entry.candidateId, organizationId: orgId } });
      const hasResume = profile?.parseStatus === 'done';
      await tx.candidateFitAssessment.upsert({
        where: { entryId },
        create: {
          organizationId: orgId,
          entryId,
          jobId: entry.jobId,
          candidateId: entry.candidateId,
          status: hasResume ? 'pending' : 'skipped_no_resume',
        },
        update: { status: hasResume ? 'pending' : 'skipped_no_resume', error: null },
      });
      return hasResume;
    });

    if (!eligible) return { status: 'skipped_no_resume' };
    await this.jobs.enqueue(context, 'candidate_fit', JSON.stringify({ entryId }), userId);
    return { status: 'pending' };
  }

  async scoreJob(context: TenantContext, userId: string, jobId: string): Promise<{ queued: number; skipped: number }> {
    const orgId = context.organizationId as string;
    const toQueue = await this.tenantPrisma.forTenant(context, async (tx) => {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: orgId } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);

      const entries = await tx.pipelineEntry.findMany({ where: { jobId, organizationId: orgId, rejected: false } });
      const candidateIds = entries.map((e) => e.candidateId);
      const profiles = candidateIds.length
        ? await tx.candidateProfile.findMany({ where: { candidateId: { in: candidateIds }, organizationId: orgId } })
        : [];
      const parsedByCandidate = new Map(profiles.map((p) => [p.candidateId, p.parseStatus === 'done']));
      const existing = await tx.candidateFitAssessment.findMany({ where: { jobId, organizationId: orgId } });
      const inFlightByEntry = new Set(existing.filter((a) => IN_FLIGHT.includes(a.status)).map((a) => a.entryId));

      const queue: string[] = [];
      let skipped = 0;
      for (const e of entries) {
        if (inFlightByEntry.has(e.id)) continue; // leave in-flight assessments alone
        const hasResume = parsedByCandidate.get(e.candidateId) === true;
        if (!hasResume) {
          await tx.candidateFitAssessment.upsert({
            where: { entryId: e.id },
            create: { organizationId: orgId, entryId: e.id, jobId, candidateId: e.candidateId, status: 'skipped_no_resume' },
            update: { status: 'skipped_no_resume', error: null },
          });
          skipped += 1;
          continue;
        }
        await tx.candidateFitAssessment.upsert({
          where: { entryId: e.id },
          create: { organizationId: orgId, entryId: e.id, jobId, candidateId: e.candidateId, status: 'pending' },
          update: { status: 'pending', error: null },
        });
        queue.push(e.id);
      }
      return { queue, skipped };
    });

    // Enqueue OUTSIDE the tx (queue.add is network I/O to Redis).
    for (const entryId of toQueue.queue) {
      await this.jobs.enqueue(context, 'candidate_fit', JSON.stringify({ entryId }), userId);
    }
    return { queued: toQueue.queue.length, skipped: toQueue.skipped };
  }

  async getForEntry(context: TenantContext, entryId: string): Promise<FitAssessmentView | null> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const a = await tx.candidateFitAssessment.findFirst({ where: { entryId, organizationId: orgId } });
      if (!a) return null;
      const job = await tx.job.findFirst({ where: { id: a.jobId, organizationId: orgId } });
      const currentHash = job
        ? computeCriteriaHash({ title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric })
        : null;
      return {
        entryId: a.entryId,
        status: a.status,
        overallScore: a.overallScore,
        summary: a.summary,
        strengths: parseJsonArray(a.strengths),
        concerns: parseJsonArray(a.concerns),
        dimensionScores: a.dimensionScores ? JSON.parse(a.dimensionScores) : null,
        scoredAt: a.scoredAt,
        error: a.error,
        stale: a.status === 'done' && currentHash !== null && a.criteriaHash !== currentHash,
      };
    });
  }
}

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/candidate-fit/candidate-fit.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidate-fit/candidate-fit.service.ts apps/api/src/candidate-fit/candidate-fit.service.spec.ts
git commit -m "feat(candidate-fit): CandidateFitService — bulk/single trigger + read with staleness"
```

---

### Task 5: Controller + module + app wiring

**Files:**
- Create: `apps/api/src/candidate-fit/candidate-fit.controller.ts`
- Create: `apps/api/src/candidate-fit/candidate-fit.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `CandidateFitModule`)
- Test: `apps/api/src/candidate-fit/candidate-fit.controller.spec.ts`

**Interfaces:**
- Consumes: `CandidateFitService` (Task 4); `JwtAuthGuard`, `PermissionsGuard`, `@RequirePermissions`, `@CurrentTenant`, `@CurrentUserId` (see `pipeline.controller.ts`).
- Produces routes:
  - `POST /jobs/:jobId/fit-assessments/score` (`pipeline:manage`) → `scoreJob`
  - `POST /pipeline/entries/:entryId/fit-assessment/score` (`pipeline:manage`) → `scoreEntry`
  - `GET /pipeline/entries/:entryId/fit-assessment` (`results:view`) → `getForEntry`

- [ ] **Step 1: Write the failing controller test**

`apps/api/src/candidate-fit/candidate-fit.controller.spec.ts`:

```ts
import { CandidateFitController } from './candidate-fit.controller';

describe('CandidateFitController', () => {
  const tenant = { organizationId: 'org-1', isSuperAdmin: false };
  let service: any;
  let controller: CandidateFitController;

  beforeEach(() => {
    service = {
      scoreJob: jest.fn().mockResolvedValue({ queued: 3, skipped: 1 }),
      scoreEntry: jest.fn().mockResolvedValue({ status: 'pending' }),
      getForEntry: jest.fn().mockResolvedValue(null),
    };
    controller = new CandidateFitController(service);
  });

  it('scoreJob delegates with tenant + user + jobId', async () => {
    await controller.scoreJob(tenant as any, 'user-1', 'job-1');
    expect(service.scoreJob).toHaveBeenCalledWith(tenant, 'user-1', 'job-1');
  });
  it('scoreEntry delegates with tenant + user + entryId', async () => {
    await controller.scoreEntry(tenant as any, 'user-1', 'entry-1');
    expect(service.scoreEntry).toHaveBeenCalledWith(tenant, 'user-1', 'entry-1');
  });
  it('getForEntry delegates with tenant + entryId', async () => {
    await controller.getForEntry(tenant as any, 'entry-1');
    expect(service.getForEntry).toHaveBeenCalledWith(tenant, 'entry-1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/candidate-fit/candidate-fit.controller.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the controller**

`apps/api/src/candidate-fit/candidate-fit.controller.ts`:

```ts
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CandidateFitService } from './candidate-fit.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidateFitController {
  constructor(private readonly fit: CandidateFitService) {}

  @Post('jobs/:jobId/fit-assessments/score')
  @RequirePermissions('pipeline:manage')
  scoreJob(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('jobId') jobId: string) {
    return this.fit.scoreJob(tenant, userId, jobId);
  }

  @Post('pipeline/entries/:entryId/fit-assessment/score')
  @RequirePermissions('pipeline:manage')
  scoreEntry(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('entryId') entryId: string) {
    return this.fit.scoreEntry(tenant, userId, entryId);
  }

  @Get('pipeline/entries/:entryId/fit-assessment')
  @RequirePermissions('results:view')
  getForEntry(@CurrentTenant() tenant: TenantContext, @Param('entryId') entryId: string) {
    return this.fit.getForEntry(tenant, entryId);
  }
}
```

- [ ] **Step 4: Implement the module**

`apps/api/src/candidate-fit/candidate-fit.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { CandidateFitService } from './candidate-fit.service';
import { CandidateFitController } from './candidate-fit.controller';

@Module({
  imports: [JobsModule], // provides JobsService (exported)
  controllers: [CandidateFitController],
  providers: [CandidateFitService],
})
export class CandidateFitModule {}
```

- [ ] **Step 5: Register in `app.module.ts`**

Add `import { CandidateFitModule } from './candidate-fit/candidate-fit.module';` and add `CandidateFitModule` to the `imports` array (alongside the other feature modules like `PipelineModule`, `InterviewsModule`).

- [ ] **Step 6: Run controller tests + build**

Run: `cd apps/api && npx jest src/candidate-fit/candidate-fit.controller.spec.ts`
Expected: PASS.

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/candidate-fit/candidate-fit.controller.ts apps/api/src/candidate-fit/candidate-fit.controller.spec.ts apps/api/src/candidate-fit/candidate-fit.module.ts apps/api/src/app.module.ts
git commit -m "feat(candidate-fit): controller (trigger + read routes) + module + app wiring"
```

---

### Task 6: Surface fit on the pipeline board

Extend `PipelineService.getPipeline` so each `BoardRow` carries the fit fields the board needs (chip + sort), read in the same tx.

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`BoardRow` interface + `getPipeline` query/mapping)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (add cases; the file already exists)

**Interfaces:**
- Produces: `BoardRow` gains `fitScore: number | null`, `fitStatus: string | null`, `fitStale: boolean`. Consumed by the web board (Task 9/11).

- [ ] **Step 1: Write the failing test** — add to `apps/api/src/pipeline/pipeline.service.spec.ts`

```ts
it('getPipeline includes fit fields per entry (score, status, stale)', async () => {
  // Arrange: mock tx.pipelineEntry.findMany to include a fitAssessment relation, and job for hashing.
  // (Follow the existing getPipeline test's mock shape; add fitAssessment to the included entry.)
  // Assert the mapped BoardRow exposes fitScore/fitStatus/fitStale.
  const board = await service.getPipeline(context, 'job-1');
  const row = board.stages.applied[0];
  expect(row).toHaveProperty('fitScore');
  expect(row).toHaveProperty('fitStatus');
  expect(row).toHaveProperty('fitStale');
});
```

(Implementer: read the existing `getPipeline` test setup first and extend its `tx.pipelineEntry.findMany` mock to return a `fitAssessment` on at least one entry, e.g. `fitAssessment: { status: 'done', overallScore: 77, criteriaHash: 'H' }`, and set the job's fields so the current hash is computable. Assert `fitScore === 77`, `fitStatus === 'done'`, and `fitStale` reflects hash equality.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/pipeline/pipeline.service.spec.ts -t "fit fields"`
Expected: FAIL — `fitScore` undefined.

- [ ] **Step 3: Implement**

In `apps/api/src/pipeline/pipeline.service.ts`:

Add to the `BoardRow` interface:

```ts
  fitScore: number | null;
  fitStatus: string | null;
  fitStale: boolean;
```

Import the hasher at the top:

```ts
import { computeCriteriaHash } from '../candidate-fit/candidate-fit.core';
```

In `getPipeline`, add `fitAssessment: true` to the entry `include`, and compute the current criteria hash once from the job, then set the three fields on each row:

```ts
      const currentHash = computeCriteriaHash({
        title: job.title, description: job.description, fitCriteria: job.fitCriteria, fitRubric: job.fitRubric,
      });
      // ...inside the entries loop, when building `row`:
        fitScore: e.fitAssessment?.overallScore ?? null,
        fitStatus: e.fitAssessment?.status ?? null,
        fitStale: e.fitAssessment?.status === 'done' && e.fitAssessment.criteriaHash !== currentHash,
```

(The `include` change: the entry `include` block gains `fitAssessment: true` alongside `candidate` and `feedback`.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/pipeline/pipeline.service.spec.ts`
Expected: PASS (new case + existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/pipeline/pipeline.service.ts apps/api/src/pipeline/pipeline.service.spec.ts
git commit -m "feat(candidate-fit): expose fit score/status/stale on pipeline BoardRow"
```

---

### Task 7: Job criteria backend (fitCriteria + fitRubric on update)

**Files:**
- Modify: `apps/api/src/pipeline/dto/update-job.dto.ts` (add `fitCriteria`, `fitRubric`)
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`updateJob` persists them, validating the rubric)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (add cases)

**Interfaces:**
- Consumes: `validateRubricInput` from Task 2.
- Produces: `PATCH /jobs/:id` accepts `fitCriteria?: string | null` and `fitRubric?: RubricDimension[] | null`; persists `fitRubric` as a JSON string (or null); a rubric whose weights don't sum to 100 → `BadRequestException`.

- [ ] **Step 1: Write the failing tests** — add to `pipeline.service.spec.ts`

```ts
describe('updateJob fit criteria', () => {
  it('persists fitCriteria and a valid rubric (as JSON string)', async () => {
    await service.updateJob(context, 'user-1', 'job-1', {
      fitCriteria: 'Must ship fast',
      fitRubric: [{ label: 'Python', weight: 60 }, { label: 'AWS', weight: 40 }],
    } as any);
    const data = tx.job.update.mock.calls.at(-1)[0].data;
    expect(data.fitCriteria).toBe('Must ship fast');
    expect(JSON.parse(data.fitRubric)).toEqual([{ label: 'Python', weight: 60 }, { label: 'AWS', weight: 40 }]);
  });

  it('clears the rubric when passed null / empty array', async () => {
    await service.updateJob(context, 'user-1', 'job-1', { fitRubric: [] } as any);
    expect(tx.job.update.mock.calls.at(-1)[0].data.fitRubric).toBeNull();
  });

  it('rejects a rubric whose weights do not sum to 100', async () => {
    await expect(
      service.updateJob(context, 'user-1', 'job-1', { fitRubric: [{ label: 'A', weight: 50 }] } as any),
    ).rejects.toThrow(/sum to 100/i);
  });
});
```

(Implementer: the existing `updateJob` test already mocks `tx.job.findFirst`/`tx.job.update`; reuse that setup.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/pipeline/pipeline.service.spec.ts -t "fit criteria"`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/api/src/pipeline/dto/update-job.dto.ts` — add:

```ts
  @IsOptional() @IsString() @MaxLength(5000)
  fitCriteria?: string;

  @IsOptional() @IsArray()
  fitRubric?: { label: string; weight: number }[];
```

(Add `IsArray` to the `class-validator` import.)

In `pipeline.service.ts`, import `validateRubricInput` and extend `updateJob`'s `dto` type + `data` handling. After the existing `data` object is built and before `tx.job.update`:

```ts
      if (dto.fitCriteria !== undefined) {
        data.fitCriteria = dto.fitCriteria?.trim() || null;
      }
      if (dto.fitRubric !== undefined) {
        const dims = validateRubricInput(dto.fitRubric ?? []); // throws -> 400 on bad weights
        data.fitRubric = dims.length ? JSON.stringify(dims) : null;
      }
```

Widen `updateJob`'s `dto` parameter type to include `fitCriteria?: string | null; fitRubric?: { label: string; weight: number }[] | null` and the local `data` type to include `fitCriteria?: string | null; fitRubric?: string | null`. Wrap `validateRubricInput`'s throw as a `BadRequestException` (import it if not already) so it surfaces as HTTP 400:

```ts
      if (dto.fitRubric !== undefined) {
        let dims;
        try { dims = validateRubricInput(dto.fitRubric ?? []); }
        catch (e) { throw new BadRequestException((e as Error).message); }
        data.fitRubric = dims.length ? JSON.stringify(dims) : null;
      }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/pipeline/pipeline.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/pipeline/dto/update-job.dto.ts apps/api/src/pipeline/pipeline.service.ts apps/api/src/pipeline/pipeline.service.spec.ts
git commit -m "feat(candidate-fit): persist Job fitCriteria + validated weighted rubric on update"
```

---

### Task 8: GDPR erase scrub

**Files:**
- Modify: `apps/api/src/candidates/candidates.service.ts` (`erase` — add an assessment scrub next to the existing `candidateProfile.updateMany`)
- Test: `apps/api/src/candidates/candidates.service.spec.ts` (add a case)

**Interfaces:**
- Consumes: existing `erase` flow. Produces: the candidate's `CandidateFitAssessment` rows have `summary`/`strengths`/`concerns`/`dimensionScores` nulled on erase.

- [ ] **Step 1: Write the failing test** — add to `candidates.service.spec.ts`

```ts
it('erase scrubs candidate fit assessment PII', async () => {
  // reuse the existing erase test setup/mocks
  await service.erase(context, 'user-1', 'cand-1');
  expect(tx.candidateFitAssessment.updateMany).toHaveBeenCalledWith({
    where: { candidateId: 'cand-1' },
    data: { summary: null, strengths: null, concerns: null, dimensionScores: null },
  });
});
```

(Implementer: extend the existing `erase` test's `tx` mock with `candidateFitAssessment: { updateMany: jest.fn().mockResolvedValue({}) }`.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/candidates/candidates.service.spec.ts -t "fit assessment PII"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `candidates.service.ts` `erase`, right after the existing `tx.candidateProfile.updateMany({ where: { candidateId }, data: { parsedSummary: null, ... } })` call, add:

```ts
      // Scrub AI fit-assessment narrative PII the same way as the parsed profile above.
      await tx.candidateFitAssessment.updateMany({
        where: { candidateId },
        data: { summary: null, strengths: null, concerns: null, dimensionScores: null },
      });
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest src/candidates/candidates.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidates/candidates.service.ts apps/api/src/candidates/candidates.service.spec.ts
git commit -m "feat(candidate-fit): scrub fit-assessment PII on GDPR erase"
```

---

### Task 9: Web types + React Query hooks

**Files:**
- Modify: `apps/web/lib/types.ts` (extend `BoardRow`; add `FitAssessment`, `RubricDimension`)
- Modify: `apps/web/lib/hooks/usePipeline.ts` (add `useFitAssessment`, `useScoreEntry`, `useScoreJob`; extend `useUpdateJob` input)
- Test: none (thin hooks; covered by component tests in Tasks 10–12). Typecheck is the gate.

**Interfaces:**
- Produces (consumed by Tasks 10–12):
  - `type FitAssessment = { entryId; status; overallScore: number | null; summary: string | null; strengths: string[]; concerns: string[]; dimensionScores: { label; weight; score }[] | null; scoredAt: string | null; error: string | null; stale: boolean }`
  - `type RubricDimension = { label: string; weight: number }`
  - `BoardRow` gains `fitScore: number | null; fitStatus: string | null; fitStale: boolean`.
  - `useFitAssessment(entryId, { poll }: { poll: boolean })` — GETs `/pipeline/entries/:entryId/fit-assessment`, refetches every 2500ms while `poll`.
  - `useScoreEntry(jobId)` — POST `/pipeline/entries/:entryId/fit-assessment/score`, invalidates board + the entry's assessment.
  - `useScoreJob(jobId)` — POST `/jobs/:jobId/fit-assessments/score`, invalidates board.
  - `useUpdateJob` input extended with `fitCriteria?: string | null; fitRubric?: RubricDimension[] | null`.

- [ ] **Step 1: Extend `apps/web/lib/types.ts`**

Add the `BoardRow` fields (find the `BoardRow` interface — it mirrors the API's) and add:

```ts
export interface RubricDimension {
  label: string;
  weight: number;
}

export interface FitAssessment {
  entryId: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  strengths: string[];
  concerns: string[];
  dimensionScores: { label: string; weight: number; score: number }[] | null;
  scoredAt: string | null;
  error: string | null;
  stale: boolean;
}
```

Add to `BoardRow`: `fitScore: number | null; fitStatus: string | null; fitStale: boolean;`. If `JobDetail` is typed, add `fitCriteria?: string | null; fitRubric?: string | null` (the API returns the raw job row).

- [ ] **Step 2: Add hooks to `apps/web/lib/hooks/usePipeline.ts`**

```ts
import { FitAssessment, RubricDimension } from '../types';

export function useFitAssessment(entryId: string, opts: { poll: boolean }) {
  const { accessToken } = useAuth();
  return useQuery<FitAssessment | null>({
    queryKey: ['entries', entryId, 'fit'],
    queryFn: () => apiFetch(`/pipeline/entries/${entryId}/fit-assessment`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && entryId),
    // Poll while a scoring run is in flight so the drawer/board update when it finishes.
    refetchInterval: opts.poll ? 2500 : false,
  });
}

export function useScoreEntry(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      apiFetch(`/pipeline/entries/${entryId}/fit-assessment/score`, { method: 'POST' }, accessToken ?? undefined),
    onSuccess: (_data, entryId) => {
      queryClient.invalidateQueries({ queryKey: ['entries', entryId, 'fit'] });
      queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] });
    },
  });
}

export function useScoreJob(jobId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<{ queued: number; skipped: number }, Error, void>({
    mutationFn: () =>
      apiFetch(`/jobs/${jobId}/fit-assessments/score`, { method: 'POST' }, accessToken ?? undefined) as Promise<{ queued: number; skipped: number }>,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs', jobId, 'pipeline'] }),
  });
}
```

Extend `useUpdateJob`'s `mutationFn` input type to include `fitCriteria?: string | null; fitRubric?: RubricDimension[] | null`.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/usePipeline.ts
git commit -m "feat(candidate-fit): web types + fit hooks (useFitAssessment/useScoreEntry/useScoreJob)"
```

---

### Task 10: CandidateDrawer "AI Fit" section

**Files:**
- Modify: `apps/web/components/pipeline/CandidateDrawer.tsx` (add an AI Fit section)
- Test: `apps/web/components/pipeline/CandidateDrawer.test.tsx` (add cases)

**Interfaces:**
- Consumes: `useFitAssessment(entryId, { poll })`, `useScoreEntry(jobId)` from Task 9; the drawer already has `entryId`, `jobId`, `candidateId` in scope (it renders Profile/feedback/messages/offers/interviews for the entry).

- [ ] **Step 1: Read the existing drawer** to see how it receives `entryId`/`jobId` and how sections are structured (props + existing `useCandidateProfile` usage).

- [ ] **Step 2: Write the failing tests** — add to `CandidateDrawer.test.tsx`

```ts
it('shows the score, summary, strengths and concerns when the assessment is done', async () => {
  // mock useFitAssessment -> { status:'done', overallScore:78, summary:'Strong', strengths:['Node'], concerns:['No AWS'], dimensionScores:null, stale:false, ... }
  // render the drawer for an entry; assert 78, 'Strong', 'Node', 'No AWS', and the advisory line are present.
});

it('shows an "Assess fit" button and calls scoreEntry when there is no assessment yet', async () => {
  // mock useFitAssessment -> null; render; click "Assess fit"; assert useScoreEntry mutate called with the entryId.
});

it('shows the no-résumé hint when status is skipped_no_resume', async () => {
  // mock -> { status:'skipped_no_resume' }; assert the "Add a résumé to assess fit" copy renders.
});
```

(Implementer: mirror the existing drawer tests' mocking approach — mock the `usePipeline` hooks module.)

- [ ] **Step 3: Implement the AI Fit section**

Add a section component in the drawer that:
- Calls `const fit = useFitAssessment(entryId, { poll: fitInFlight })` where `fitInFlight` is `fit.data?.status === 'pending' || fit.data?.status === 'processing'`.
- Calls `const scoreEntry = useScoreEntry(jobId)`.
- Renders by `fit.data?.status`:
  - `null`/absent → "No fit assessment yet." + **Assess fit** button (`onClick={() => scoreEntry.mutate(entryId)}`).
  - `pending`/`processing` → spinner "Scoring…".
  - `skipped_no_resume` → "Add a résumé to assess fit." (no score).
  - `skipped_no_ai_key` → "Configure an AI provider in settings to use AI fit scoring."
  - `failed` → "Scoring failed." + **Retry** button (`scoreEntry.mutate(entryId)`).
  - `done` → the score (big number), `summary`, **Strengths** / **Concerns** bullet lists, per-dimension bars if `dimensionScores` (each `{label} — {score}/100`, weight shown), a **Re-score** button, and if `stale` a "Job criteria changed — re-score" note.
- Always renders the advisory line: `AI-generated guidance — a hiring aid, not a decision. Review the candidate yourself.`

Follow the existing drawer's styling/section markup (reuse the same section header + chip patterns already used for Profile/Offers).

- [ ] **Step 4: Run the drawer tests**

Run: `cd apps/web && npx jest components/pipeline/CandidateDrawer.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/pipeline/CandidateDrawer.tsx apps/web/components/pipeline/CandidateDrawer.test.tsx
git commit -m "feat(candidate-fit): CandidateDrawer AI Fit section (score/summary/strengths/concerns, assess/re-score)"
```

---

### Task 11: PipelineBoard — fit chip, sort, bulk score

**Files:**
- Modify: `apps/web/components/pipeline/PipelineBoard.tsx`
- Test: `apps/web/components/pipeline/PipelineBoard.test.tsx` (create if absent, else extend)

**Interfaces:**
- Consumes: `BoardRow.fitScore/fitStatus/fitStale` (Task 6/9), `useScoreJob(jobId)` (Task 9).

- [ ] **Step 1: Read `PipelineBoard.tsx`** to see how rows and the job header are rendered.

- [ ] **Step 2: Write the failing tests**

```ts
it('renders a fit-score chip on a scored row and a dash on an unscored row', () => {
  // board with two rows: one fitScore=82, one fitScore=null; assert '82' shown and a '—' for the other.
});
it('"Sort by fit" reorders a stage column by fitScore descending', () => {
  // toggle sort; assert row order changes so the higher fitScore comes first, nulls last.
});
it('"Score candidates" calls useScoreJob', () => {
  // click the header button; assert scoreJob.mutate called.
});
```

- [ ] **Step 3: Implement**

- Add a **"Score candidates"** button in the job header area: `const scoreJob = useScoreJob(jobId); ... <button onClick={() => scoreJob.mutate()} disabled={scoreJob.isPending}>Score candidates</button>`. While `scoreJob.isPending` show "Scoring…"; after success, the board's own query invalidation refreshes chips as rows finish (they poll via the existing board query — add `refetchInterval` to `useJobPipeline` only while any row `fitStatus` is `pending`/`processing`, or rely on manual refresh; simplest: invalidate on success and let the recruiter see rows fill in on the next board refetch).
- Add a **fit chip** next to each row's existing exam-result display: `row.fitScore != null ? <span className={chipColor(row.fitScore)}>{row.fitScore}</span> : <span className="muted">—</span>`, with a ⚠ marker when `row.fitStale`.
- Add a **"Sort by fit"** toggle (local `useState`) that, when on, sorts each stage's rows by `fitScore` desc (`null` last) before rendering.

Keep `chipColor` a tiny local helper (e.g. ≥75 green, ≥50 amber, else grey) — ponytail: inline, no new lib.

- [ ] **Step 4: Run the board tests**

Run: `cd apps/web && npx jest components/pipeline/PipelineBoard.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/pipeline/PipelineBoard.tsx apps/web/components/pipeline/PipelineBoard.test.tsx
git commit -m "feat(candidate-fit): board fit chip + sort-by-fit + bulk Score candidates"
```

---

### Task 12: Job form — criteria + weighted rubric editor

**Files:**
- Modify: the recruiter job edit form under `apps/web/app/(recruiter)/jobs/` (locate the component that renders the job title/description edit — likely `apps/web/app/(recruiter)/jobs/[jobId]/page.tsx` or a `JobForm`/`JobSettings` component it uses)
- Test: the corresponding `*.test.tsx` (create/extend)

**Interfaces:**
- Consumes: `useUpdateJob(jobId)` (extended in Task 9); `RubricDimension` type. The current job (`useJob`) exposes `fitCriteria` (string) and `fitRubric` (JSON string) to seed the editors.

- [ ] **Step 1: Read the existing job edit component** to see how title/description are edited and saved via `useUpdateJob`.

- [ ] **Step 2: Write the failing tests**

```ts
it('saves fitCriteria via useUpdateJob', () => {
  // type into the "What you're looking for" field; save; assert updateJob called with { fitCriteria: '...' }.
});
it('shows a running weight total and blocks save when the rubric does not sum to 100', () => {
  // add two dimensions weighted 60 + 30; assert the total banner shows 90 and Save is disabled with a sum-to-100 hint.
});
it('saves a valid rubric (sums to 100) as an array', () => {
  // 60 + 40; save; assert updateJob called with fitRubric: [{label,weight}...].
});
```

- [ ] **Step 3: Implement**

- Add an optional **"What you're looking for"** `<textarea>` bound to a `fitCriteria` state seeded from the job; include it in the `useUpdateJob` payload on save.
- Add a **rubric editor**: rows of `{ label, weight }` with add/remove; parse the seed from `job.fitRubric` (JSON string → array). Show a **running-total banner** (sum of weights) — mirror the exam section-weights panel pattern (`ExamSectionsPanel`) for the banner + disable-save-until-100 behavior. When any dimension exists, require the sum === 100 to enable Save; an empty rubric list is allowed (clears it). Send `fitRubric` as the array (or `[]` to clear) in the `useUpdateJob` payload.
- Ponytail: reuse the existing form's save button + layout; do not build a separate settings page.

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && npx jest <the job form test path>`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/(recruiter)/jobs apps/web/components  # exact paths touched
git commit -m "feat(candidate-fit): job form fitCriteria field + weighted rubric editor"
```

---

### Task 13: Full verification

**Files:** none (verification only).

- [ ] **Step 1: API suite + typecheck**

Run: `cd apps/api && npx jest`
Expected: all green (existing + new candidate-fit/pipeline/candidates specs).

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 2: Web suite + typecheck**

Run: `cd apps/web && npx jest --maxWorkers=2`
Expected: all green (note: `login`/`design-lab` files may carry a concurrent session's uncommitted WIP — attribute only those to that, not to this feature).

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Prisma validate**

Run: `cd apps/api && npx prisma validate`
Expected: valid.

- [ ] **Step 4: Commit any final fixes, then stop for whole-branch review**

The branch is ready for the final whole-branch review (subagent-driven-development's final gate) before merge + deploy.

## Self-review notes (coverage against spec)

- Data model + Job criteria + RLS → Task 1. ✅
- Layered criteria (job desc / free-text / weighted rubric) → prompt + schema in Task 2, persistence in Task 7, editor in Task 12. ✅
- Exam kept separate (AI never sees exam) → prompt in Task 2 asserts it; no exam data threaded into the processor (Task 3). ✅
- On-demand bulk + single trigger → Task 4 service, Task 5 controller, Task 11 (bulk) + Task 10 (single) UI. ✅
- Sort-by-score ranking → Task 6 (board fields) + Task 11 (sort toggle). ✅
- Async via AiJob/BullMQ, AI outside tx, AiNotConfiguredError distinct, AiCreditUsage, audit via createdBy → Task 3. ✅
- Staleness (criteriaHash) → Task 2 (hash) + Task 4 (read) + Task 6 (board) + Task 10 (drawer prompt). ✅
- Advisory-only + all UI states → Task 10/11. ✅
- GDPR scrub → Task 8. ✅
- Permissions (pipeline:manage trigger, results:view read) → Task 5. ✅
- Deferred comparative pass → not built; the processor/model seam remains. ✅
