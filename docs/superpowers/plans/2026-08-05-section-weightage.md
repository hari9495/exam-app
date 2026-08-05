# Section Weightage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter assign each exam section an independent weight (a percentage, 0–100, summing to 100 across an exam's sections) that becomes the real scoring formula — driving `Result.percentage`, pass/fail, and leaderboard rank — decoupled from how many raw marks a section's questions add up to.

**Architecture:** A new `ExamSection.weightPercent` column, backfilled once for existing sections (proportional to current marks, so no historical score changes), defaulted server-side for new sections, editable through the existing section-update endpoint (already lock-on-publish), validated to sum to 100 at publish time, and consumed by a new section-aware formula in the two `computeResult()` call sites inside attempt settlement — using the per-attempt `sectionSnapshotJson` that already exists for this exact purpose.

**Tech Stack:** NestJS + Prisma (SQL Server) on apps/api and apps/exam-runtime, Next.js + React Query on apps/web, Jest across all three.

## Global Constraints

- `weightPercent` is an `Int` (0–100), never a float — no fractional percentages.
- A published exam (or one with any started attempt) cannot have its sections' weights edited — this is the existing `assertExamMutable()` guarantee in `exams.service.ts`, inherited automatically by routing weight edits through the existing `updateSection` DTO/endpoint. Do not add new locking logic.
- Publish is blocked (`BadRequestException`) unless `Σ section.weightPercent === 100` for that exam.
- `Result.score` / `Result.maxScore` remain the raw, unweighted totals. Only `Result.percentage` becomes the weighted number.
- The backfill for pre-existing sections must make every already-published exam's weighted percentage mathematically identical to its current (unweighted) percentage — no historical `Result` row gets rewritten.
- Follow this repo's established two-migration backfill pattern (`20260804120000_invitation_email_status` + `20260805100000_backfill_invitation_email_status`): schema migration first (nullable column), backfill second, then a follow-up migration making the column `NOT NULL`. The backfill computation itself is TypeScript (unit-testable), not raw SQL, because it needs largest-remainder rounding — not expressible safely in a single T-SQL statement in this codebase's proven-fragile SQL Server migration environment.
- Local dev DB migrations use `prisma migrate deploy` after `prisma migrate diff --from-url "$DB_URL" --to-schema-datamodel ./prisma/schema.prisma --script` is NOT the path here — write migration.sql files by hand (small, precise ALTER statements), matching how `20260804120000_invitation_email_status`/`20260805020000_walk_in_groups` were done, then `npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma` from `apps/api`.

---

### Task 1: Schema — add `weightPercent` as a nullable column

**Files:**
- Modify: `apps/api/prisma/schema.prisma:351-366` (`ExamSection` model)
- Create: `apps/api/prisma/migrations/20260805130000_exam_section_weight/migration.sql`

**Interfaces:**
- Produces: `ExamSection.weightPercent: number | null` on the generated Prisma Client, consumed by every later task.

- [ ] **Step 1: Add the field to the schema**

In `apps/api/prisma/schema.prisma`, change the `ExamSection` model (currently lines 351–366):

```prisma
model ExamSection {
  id                    String                @id @default(uuid()) @db.UniqueIdentifier
  examId                String                @map("exam_id") @db.UniqueIdentifier
  title                 String
  orderIndex            Int                   @map("order_index")
  selectionMode         String                @default("fixed") @map("selection_mode")
  poolSize              Int?                  @map("pool_size")
  poolDifficulty        String?               @map("pool_difficulty")
  targetDurationMinutes Int?                  @map("target_duration_minutes")
  // Nullable during the backfill window (Task 3 makes it NOT NULL). A section's share of the
  // exam's grade, independent of its questions' raw marks -- see docs/superpowers/specs/
  // 2026-08-05-section-weightage-design.md. Every exam's sections must sum to exactly 100
  // before it can be published (enforced in ExamsService#publish).
  weightPercent         Int?                  @map("weight_percent")
  exam                  Exam                  @relation(fields: [examId], references: [id], onDelete: Cascade)
  questions             ExamSectionQuestion[]
  poolTags              ExamSectionPoolTag[]

  @@index([examId])
  @@map("exam_sections")
}
```

- [ ] **Step 2: Write the migration**

Create `apps/api/prisma/migrations/20260805130000_exam_section_weight/migration.sql`:

```sql
ALTER TABLE [dbo].[exam_sections] ADD [weight_percent] INT NULL;
```

- [ ] **Step 3: Apply locally and regenerate the client**

Run from `apps/api`:
```bash
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
npx prisma generate --schema=apps/api/prisma/schema.prisma
```
Expected: `1 migration found... Applying migration 20260805130000_exam_section_weight... All migrations have been successfully applied.` then `✔ Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260805130000_exam_section_weight
git commit -m "feat(exams): add nullable weightPercent column to ExamSection"
```

---

### Task 2: Default-weight computation (pure function + tests)

**Files:**
- Create: `apps/api/src/exams/section-weight-defaults.ts`
- Create: `apps/api/src/exams/section-weight-defaults.spec.ts`

**Interfaces:**
- Consumes: nothing (pure function, no DB access).
- Produces: `computeDefaultWeights(sections: WeightableSectionInput[]): Map<string, number>` — used by Task 3's backfill script. `WeightableSectionInput = { id: string; selectionMode: 'fixed' | 'pool'; totalMarks: number }`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/exams/section-weight-defaults.spec.ts`:

```ts
import { computeDefaultWeights } from './section-weight-defaults';

describe('computeDefaultWeights', () => {
  it('returns an empty map for no sections', () => {
    expect(computeDefaultWeights([])).toEqual(new Map());
  });

  it('gives a lone section 100%, regardless of its marks', () => {
    const result = computeDefaultWeights([{ id: 's1', selectionMode: 'fixed', totalMarks: 37 }]);
    expect(result).toEqual(new Map([['s1', 100]]));
  });

  it('splits two fixed sections proportionally to their marks', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'fixed', totalMarks: 30 },
      { id: 's2', selectionMode: 'fixed', totalMarks: 70 },
    ]);
    expect(result).toEqual(new Map([['s1', 30], ['s2', 70]]));
  });

  it('rounds three equal-marks fixed sections to integers summing to exactly 100', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'fixed', totalMarks: 10 },
      { id: 's2', selectionMode: 'fixed', totalMarks: 10 },
      { id: 's3', selectionMode: 'fixed', totalMarks: 10 },
    ]);
    const values = [...result.values()];
    expect(values.reduce((sum, v) => sum + v, 0)).toBe(100);
    // 33.33/33.33/33.33 -- exactly one of them absorbs the rounding remainder to 34.
    expect(values.sort()).toEqual([33, 33, 34]);
  });

  it('splits an all-pool exam equally among its pool sections', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'pool', totalMarks: 0 },
      { id: 's2', selectionMode: 'pool', totalMarks: 0 },
    ]);
    expect(result).toEqual(new Map([['s1', 50], ['s2', 50]]));
  });

  it('reserves pool sections a one-section-equivalent share and splits the rest by marks among fixed sections', () => {
    // 3 sections total (2 fixed + 1 pool) -- the pool section gets 100/3 = 33.33%, same as if
    // it were "one vote" among three; the remaining 66.67% splits 30/70 between the fixed pair.
    const result = computeDefaultWeights([
      { id: 'fixed-a', selectionMode: 'fixed', totalMarks: 30 },
      { id: 'fixed-b', selectionMode: 'fixed', totalMarks: 70 },
      { id: 'pool-a', selectionMode: 'pool', totalMarks: 0 },
    ]);
    const values = [...result.values()];
    expect(values.reduce((sum, v) => sum + v, 0)).toBe(100);
    // 66.67 * 0.3 = 20.0, 66.67 * 0.7 = 46.67, 33.33 -- floors [20, 46, 33] = 99, so the largest
    // fractional remainder (fixed-b's 0.67) absorbs the +1.
    expect(result.get('fixed-a')).toBe(20);
    expect(result.get('fixed-b')).toBe(47);
    expect(result.get('pool-a')).toBe(33);
  });

  it('falls back to an equal split among fixed sections when their combined marks are zero (no questions yet)', () => {
    const result = computeDefaultWeights([
      { id: 's1', selectionMode: 'fixed', totalMarks: 0 },
      { id: 's2', selectionMode: 'fixed', totalMarks: 0 },
    ]);
    expect(result).toEqual(new Map([['s1', 50], ['s2', 50]]));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test --workspace=apps/api -- section-weight-defaults
```
Expected: FAIL — `Cannot find module './section-weight-defaults'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/exams/section-weight-defaults.ts`:

```ts
export interface WeightableSectionInput {
  id: string;
  selectionMode: 'fixed' | 'pool';
  totalMarks: number;
}

// Distributes 100 raw (fractional) percentage points across sections into integers that sum to
// exactly 100, giving the +1 remainder to whichever entries had the largest fractional part
// (the standard largest-remainder / Hamilton apportionment method) -- minimizes distortion
// versus e.g. always rounding down and dumping the leftover on one arbitrary section.
function roundToIntegersSumming100(rawValues: { id: string; value: number }[]): Map<string, number> {
  const withFloor = rawValues.map((v) => ({ id: v.id, floor: Math.floor(v.value), remainder: v.value - Math.floor(v.value) }));
  const flooredSum = withFloor.reduce((sum, v) => sum + v.floor, 0);
  const remaining = 100 - flooredSum;
  const byRemainderDesc = [...withFloor].sort((a, b) => b.remainder - a.remainder);
  const result = new Map(withFloor.map((v) => [v.id, v.floor]));
  for (let i = 0; i < remaining; i++) {
    const id = byRemainderDesc[i].id;
    result.set(id, (result.get(id) ?? 0) + 1);
  }
  return result;
}

// Backfill default: a section's weight before any recruiter has ever touched it. Fixed sections
// split proportionally to their current marks; pool sections have no fixed mark total (each
// candidate draws a different subset), so they're treated as a single "average section" worth
// among the total section count, then split that reserved share equally among themselves.
export function computeDefaultWeights(sections: WeightableSectionInput[]): Map<string, number> {
  if (sections.length === 0) {
    return new Map();
  }
  if (sections.length === 1) {
    return new Map([[sections[0].id, 100]]);
  }

  const poolSections = sections.filter((s) => s.selectionMode === 'pool');
  const fixedSections = sections.filter((s) => s.selectionMode === 'fixed');
  const poolTotalPercent = (100 * poolSections.length) / sections.length;
  const fixedTotalPercent = 100 - poolTotalPercent;
  const totalFixedMarks = fixedSections.reduce((sum, s) => sum + s.totalMarks, 0);

  const raw: { id: string; value: number }[] = [];
  for (const section of poolSections) {
    raw.push({ id: section.id, value: poolTotalPercent / poolSections.length });
  }
  for (const section of fixedSections) {
    const share = totalFixedMarks > 0 ? section.totalMarks / totalFixedMarks : 1 / fixedSections.length;
    raw.push({ id: section.id, value: fixedTotalPercent * share });
  }

  return roundToIntegersSumming100(raw);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test --workspace=apps/api -- section-weight-defaults
```
Expected: PASS, 7/7.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exams/section-weight-defaults.ts apps/api/src/exams/section-weight-defaults.spec.ts
git commit -m "feat(exams): add default section-weight computation (largest-remainder rounding)"
```

---

### Task 3: Backfill script + NOT NULL migration

**Files:**
- Create: `apps/api/scripts/backfill-section-weights.ts`
- Create: `apps/api/prisma/migrations/20260805130100_exam_section_weight_not_null/migration.sql`

**Interfaces:**
- Consumes: `computeDefaultWeights` from Task 2.

- [ ] **Step 1: Write the backfill script**

Create `apps/api/scripts/backfill-section-weights.ts`:

```ts
import { PrismaService } from '@exam-platform/shared';
import { computeDefaultWeights } from '../src/exams/section-weight-defaults';

async function main() {
  const prisma = new PrismaService();
  const sections = await prisma.examSection.findMany({
    where: { weightPercent: null },
    include: { questions: { include: { question: { select: { marks: true } } } } },
  });

  const byExamId = new Map<string, typeof sections>();
  for (const section of sections) {
    const list = byExamId.get(section.examId) ?? [];
    list.push(section);
    byExamId.set(section.examId, list);
  }

  let updated = 0;
  for (const [examId, examSections] of byExamId) {
    const weights = computeDefaultWeights(
      examSections.map((section) => ({
        id: section.id,
        selectionMode: section.selectionMode as 'fixed' | 'pool',
        totalMarks: section.questions.reduce((sum, link) => sum + link.question.marks, 0),
      })),
    );
    for (const section of examSections) {
      const weightPercent = weights.get(section.id) ?? 0;
      await prisma.examSection.update({ where: { id: section.id }, data: { weightPercent } });
      updated += 1;
    }
    console.log(`Exam ${examId}: ${examSections.length} section(s) backfilled`);
  }
  console.log(`Done. ${updated} section(s) updated across ${byExamId.size} exam(s).`);
}

main();
```

- [ ] **Step 2: Run it against the local dev DB**

```bash
cd "apps/api" && npx ts-node scripts/backfill-section-weights.ts
```
Expected: a per-exam log line, ending `Done. N section(s) updated across M exam(s).` with `N` matching the total `ExamSection` row count and no thrown errors.

- [ ] **Step 3: Verify every section now has a value, and every exam sums to 100**

Run this ad hoc check (temporary file, delete after):
```bash
cat > apps/api/verify-backfill.cjs << 'EOF'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const nullCount = await prisma.examSection.count({ where: { weightPercent: null } });
  console.log('sections still null:', nullCount);
  const sections = await prisma.examSection.findMany({ select: { examId: true, weightPercent: true } });
  const byExam = new Map();
  for (const s of sections) byExam.set(s.examId, (byExam.get(s.examId) ?? 0) + s.weightPercent);
  const bad = [...byExam.entries()].filter(([, sum]) => sum !== 100);
  console.log('exams not summing to 100:', bad);
  await prisma.$disconnect();
})();
EOF
node apps/api/verify-backfill.cjs
rm apps/api/verify-backfill.cjs
```
Expected: `sections still null: 0` and `exams not summing to 100: []`.

- [ ] **Step 4: Write the follow-up migration making the column required**

Create `apps/api/prisma/migrations/20260805130100_exam_section_weight_not_null/migration.sql`:

```sql
ALTER TABLE [dbo].[exam_sections] ALTER COLUMN [weight_percent] INT NOT NULL;
```

Update `apps/api/prisma/schema.prisma`'s `ExamSection.weightPercent` field from `Int?` to `Int` (drop the `?` and the "Nullable during the backfill window" comment, since Task 4 onward treats it as always-present):

```prisma
  // A section's share of the exam's grade, independent of its questions' raw marks -- see
  // docs/superpowers/specs/2026-08-05-section-weightage-design.md. Every exam's sections must
  // sum to exactly 100 before it can be published (enforced in ExamsService#publish).
  weightPercent         Int                   @map("weight_percent")
```

- [ ] **Step 5: Apply the migration and regenerate**

```bash
cd "apps/api" && npx prisma migrate deploy --schema=prisma/schema.prisma && npx prisma generate --schema=prisma/schema.prisma
```
Expected: `Applying migration 20260805130100_exam_section_weight_not_null` succeeds (it will fail loudly if any row is still null — confirming Step 3's check was correct).

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/backfill-section-weights.ts apps/api/prisma/migrations/20260805130100_exam_section_weight_not_null apps/api/prisma/schema.prisma
git commit -m "feat(exams): backfill weightPercent for existing sections, make column required"
```

---

### Task 4: `createSection`/`duplicateSection` default weight, `updateSection` accepts it

**Files:**
- Modify: `apps/api/src/exams/dto/update-exam-section.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts:633-720,742-780` (`createSection`, `updateSection`, `duplicateSection`)
- Modify: `apps/api/src/exams/exams.service.spec.ts:780-798` (existing `createSection` tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `UpdateExamSectionDto.weightPercent?: number`, consumed by Task 5's publish validation and by the frontend in Task 10.

- [ ] **Step 1: Add the field to the update DTO**

In `apps/api/src/exams/dto/update-exam-section.dto.ts`, add to the class (after the existing `poolTagIds` field):

```ts
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { CreateExamSectionDto } from './create-exam-section.dto';

export class UpdateExamSectionDto extends CreateExamSectionDto {
  @IsOptional()
  @IsIn(['fixed', 'pool'])
  selectionMode?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsInt()
  @Min(1)
  poolSize?: number;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  poolDifficulty?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  poolTagIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weightPercent?: number;
}
```
(This adds `Max` to the existing `class-validator` import line.)

- [ ] **Step 2: Update the failing test for `createSection`'s default**

In `apps/api/src/exams/exams.service.spec.ts`, update the existing test at line 780 (`'creates a section appended after the current last orderIndex'`) — it currently asserts `weightPercent` is absent; a second section must now default to `0`:

```ts
  it('creates a section appended after the current last orderIndex, defaulting weight to 0 for a non-first section', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ orderIndex: 2 }),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 3 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.createSection(context, 'exam-1', { title: 'Section B' });

    expect(result.orderIndex).toBe(3);
    expect(tx.examSection.create).toHaveBeenCalledWith({
      data: { examId: 'exam-1', title: 'Section B', orderIndex: 3, targetDurationMinutes: undefined, weightPercent: 0 },
    });
  });

  it('defaults weight to 100 when this is the exam\'s first section', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue(null), // no duplicate, no prior last section
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 0 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.createSection(context, 'exam-1', { title: 'Only Section' });

    expect(tx.examSection.create).toHaveBeenCalledWith({
      data: { examId: 'exam-1', title: 'Only Section', orderIndex: 0, targetDurationMinutes: undefined, weightPercent: 100 },
    });
  });
```

Also update the existing test at (originally) line 815 (`'creates a section with a target duration when provided'`) — its `findFirst` mock resolves `null` for both calls, so `lastSection` is falsy and weight must be `100`:

```ts
  it('creates a section with a target duration when provided', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 0, targetDurationMinutes: 20 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.createSection(context, 'exam-1', { title: 'Section A', targetDurationMinutes: 20 });

    expect(tx.examSection.create).toHaveBeenCalledWith({
      data: { examId: 'exam-1', title: 'Section A', orderIndex: 0, targetDurationMinutes: 20, weightPercent: 100 },
    });
  });
```

Add a new test for `duplicateSection` copying the source's weight, next to the existing `describe('duplicateSection', ...)` block (starts at line 1200 — read that block first to match its existing tx-mock shape for `examSection.findFirst`/`create`/`poolTags`, then add):

```ts
  it('copies the source section\'s weightPercent onto the duplicate', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'section-1', title: 'Original', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 40, poolTags: [], questions: [] })
          .mockResolvedValueOnce(null),
        create: jest.fn().mockResolvedValue({ id: 'section-2', title: 'Original (Copy)', weightPercent: 40 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.duplicateSection(context, 'exam-1', 'section-1');

    expect(tx.examSection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ weightPercent: 40 }) }),
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test --workspace=apps/api -- exams.service.spec.ts -t "weight"
```
Expected: FAIL — `create` was not called with a `weightPercent` field.

- [ ] **Step 4: Implement `createSection`'s default**

In `apps/api/src/exams/exams.service.ts`, change `createSection` (currently lines 633–659):

```ts
  async createSection(context: TenantContext, examId: string, dto: CreateExamSectionDto): Promise<ExamSection> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      await this.assertExamMutable(tx, examId, exam.status);

      const title = dto.title.trim();
      const duplicate = await tx.examSection.findFirst({ where: { examId, title } });
      if (duplicate) {
        throw new BadRequestException(`A section named "${title}" already exists in this exam`);
      }

      const lastSection = await tx.examSection.findFirst({
        where: { examId },
        orderBy: { orderIndex: 'desc' },
      });
      const orderIndex = lastSection ? lastSection.orderIndex + 1 : 0;
      // A lone section is trivially the whole grade -- no recruiter action needed for the common
      // single-section exam. Any additional section starts unweighted; the running total (surfaced
      // in the UI, enforced again at publish) makes it obvious it needs to be assigned.
      const weightPercent = lastSection ? 0 : 100;

      return tx.examSection.create({
        data: { examId, title, orderIndex, targetDurationMinutes: dto.targetDurationMinutes, weightPercent },
      });
    });
  }
```

- [ ] **Step 5: Implement `updateSection` accepting the field**

In `apps/api/src/exams/exams.service.ts`'s `updateSection` (currently lines 661–720), add `weightPercent` to the final `data:` object (after the existing `targetDurationMinutes` line):

```ts
      return tx.examSection.update({
        where: { id: sectionId },
        data: {
          title: dto.title,
          selectionMode: nextMode,
          poolSize: nextMode === 'pool' ? (dto.poolSize ?? section.poolSize) : null,
          poolDifficulty: nextMode === 'pool' ? (dto.poolDifficulty ?? section.poolDifficulty) : null,
          ...(nextMode === 'pool' && uniquePoolTagIds
            ? { poolTags: { create: uniquePoolTagIds.map((tagId) => ({ tagId })) } }
            : {}),
          ...(dto.targetDurationMinutes !== undefined ? { targetDurationMinutes: dto.targetDurationMinutes } : {}),
          ...(dto.weightPercent !== undefined ? { weightPercent: dto.weightPercent } : {}),
        },
        include: { poolTags: true },
      });
```

- [ ] **Step 6: Implement `duplicateSection` copying the weight**

In `apps/api/src/exams/exams.service.ts`'s `duplicateSection` (currently lines 742–780ish), add `weightPercent: section.weightPercent` to the clone's `data:` object:

```ts
      const clone = await tx.examSection.create({
        data: {
          examId,
          title: `${section.title} (Copy)`,
          orderIndex,
          selectionMode: section.selectionMode,
          poolSize: section.poolSize,
          poolDifficulty: section.poolDifficulty,
          targetDurationMinutes: section.targetDurationMinutes,
          weightPercent: section.weightPercent,
          ...(section.poolTags.length > 0
            ? { poolTags: { create: section.poolTags.map((poolTag) => ({ tagId: poolTag.tagId })) } }
            : {}),
        },
      });
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npm test --workspace=apps/api -- exams.service.spec.ts
```
Expected: PASS, full file.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exams/dto/update-exam-section.dto.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat(exams): section create/update/duplicate handle weightPercent"
```

---

### Task 5: `publish()` validates weights sum to 100

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts:487-526` (`publish`)
- Modify: `apps/api/src/exams/exams.service.spec.ts:1542-1607` (existing `publish` tests)

**Interfaces:**
- Consumes: `ExamSection.weightPercent` (Task 1/3).

- [ ] **Step 1: Update existing publish test fixtures to include a valid weightPercent**

In `apps/api/src/exams/exams.service.spec.ts`, every mocked `sections` array passed into `exam.findFirst`'s resolved value for the `publish` tests (lines 1542–1607) needs `weightPercent` added to each section object so the new sum check doesn't spuriously fail them. Update all four:

```ts
  it('publishes a draft exam that has at least one section with at least one question in each', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [{ id: 'section-1', title: 'Section One', weightPercent: 100, questions: [{ questionId: 'q1' }] }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.publish(context, 'user-1', 'exam-1');

    expect(result.status).toBe('published');
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { status: 'published' } });
    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1',
    });
  });
```

`'throws BadRequestException when publishing an exam that is not in draft status'` (its `sections: []` is fine, unchanged — the draft-status check throws before the weight check runs).

`'throws BadRequestException when publishing an exam with no sections'` — unchanged for the same reason.

`'throws BadRequestException when publishing an exam with a section that has no questions'` — add `weightPercent: 100` to `section-1` and `weightPercent: 0` to `section-2` so this test still fails for the reason it's testing (no questions), not a coincidental weight-sum failure that would happen to also be true here:

```ts
  it('throws BadRequestException when publishing an exam with a section that has no questions', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Section One', weightPercent: 100, questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', weightPercent: 0, questions: [] },
          ],
        }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(BadRequestException);
  });
```

- [ ] **Step 2: Write the new failing tests for the weight-sum check**

Add these two tests right after the "section that has no questions" test in the same `describe` block:

```ts
  it('throws BadRequestException when section weights do not sum to 100', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Section One', weightPercent: 60, questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', weightPercent: 30, questions: [{ questionId: 'q2' }] },
          ],
        }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(
      'Section weights must sum to 100% before publishing (currently 90%)',
    );
  });

  it('publishes successfully when section weights sum to exactly 100', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Section One', weightPercent: 60, questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', weightPercent: 40, questions: [{ questionId: 'q2' }] },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.publish(context, 'user-1', 'exam-1');

    expect(result.status).toBe('published');
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npm test --workspace=apps/api -- exams.service.spec.ts -t "weights"
```
Expected: FAIL — no such validation exists yet.

- [ ] **Step 4: Implement the check**

In `apps/api/src/exams/exams.service.ts`'s `publish` (currently lines 487–526), add the check right after the "no sections" check and before the pool-availability loop:

```ts
      if (exam.sections.length === 0) {
        throw new BadRequestException('Exam must have at least one section before it can be published');
      }
      const weightSum = exam.sections.reduce((sum, section) => sum + section.weightPercent, 0);
      if (weightSum !== 100) {
        throw new BadRequestException(`Section weights must sum to 100% before publishing (currently ${weightSum}%)`);
      }
      for (const section of exam.sections) {
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test --workspace=apps/api -- exams.service.spec.ts
```
Expected: PASS, full file.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat(exams): block publish unless section weights sum to 100%"
```

---

### Task 6: `grading.ts` — weighted `computeResult`

**Files:**
- Modify: `apps/exam-runtime/src/grading/grading.ts:26-44`
- Modify: `apps/exam-runtime/src/grading/grading.spec.ts:45-75`

**Interfaces:**
- Produces: `computeResult(gradedAnswers: { questionId: string; marksAwarded: number }[], questions: { id: string; marks: number }[], passCriteriaPercent: number, sections: GradableSection[]): ResultSummary`, where `GradableSection = { sectionId: string; weightPercent: number; questionIds: string[] }`. This is a breaking signature change — Task 7 updates both callers in the same PR.

- [ ] **Step 1: Update the existing tests for the new signature, and add weighted-specific cases**

Replace the whole `describe('computeResult', ...)` block in `apps/exam-runtime/src/grading/grading.spec.ts` (currently lines 45–75):

```ts
describe('computeResult', () => {
  const oneSection = (questionIds: string[], weightPercent = 100) => [{ sectionId: 's1', weightPercent, questionIds }];

  it('computes score, maxScore, percentage, and pass when meeting the pass criteria', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 5 }, { questionId: 'q2', marksAwarded: 0 }],
      [{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }],
      50,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
  });

  it('returns fail when below the pass criteria', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 2 }],
      [{ id: 'q1', marks: 10 }],
      50,
      oneSection(['q1']),
    );
    expect(summary).toEqual({ score: 2, maxScore: 10, percentage: 20, passFail: 'fail' });
  });

  it('counts an unanswered question toward maxScore but contributes nothing to score', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 3 }],
      [{ id: 'q1', marks: 3 }, { id: 'q2', marks: 7 }],
      40,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'fail' });
  });

  it('returns a zero percentage instead of dividing by zero when there are no questions', () => {
    const summary = computeResult([], [], 40, []);
    expect(summary).toEqual({ score: 0, maxScore: 0, percentage: 0, passFail: 'fail' });
  });

  it('floors a negative raw score at zero instead of returning a negative score or percentage', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 3 }, { questionId: 'q2', marksAwarded: -5 }],
      [{ id: 'q1', marks: 3 }, { id: 'q2', marks: 3 }],
      50,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 0, maxScore: 6, percentage: 0, passFail: 'fail' });
  });

  it('does not floor a positive score that is merely reduced by a deduction', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 5 }, { questionId: 'q2', marksAwarded: -2 }],
      [{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }],
      20,
      oneSection(['q1', 'q2']),
    );
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'pass' });
  });

  it('weights two sections independently of their raw marks -- a heavier-weighted section with a lower score pulls the overall percentage down', () => {
    // Section A: 1/1 marks (100% raw) but only worth 30% of the grade.
    // Section B: 0/1 marks (0% raw) but worth 70% of the grade.
    // Flat (unweighted) would be 1/2 = 50%; weighted must be 0.3*100 + 0.7*0 = 30%.
    const summary = computeResult(
      [{ questionId: 'a1', marksAwarded: 1 }, { questionId: 'b1', marksAwarded: 0 }],
      [{ id: 'a1', marks: 1 }, { id: 'b1', marks: 1 }],
      50,
      [
        { sectionId: 'A', weightPercent: 30, questionIds: ['a1'] },
        { sectionId: 'B', weightPercent: 70, questionIds: ['b1'] },
      ],
    );
    expect(summary.score).toBe(1);
    expect(summary.maxScore).toBe(2);
    expect(summary.percentage).toBe(30);
    expect(summary.passFail).toBe('fail');
  });

  it('floors a negative section score at zero before weighting, so one section cannot drag another negative', () => {
    // Section A: -3 raw (negative marks exceed correct marks) but weighted 50% -- contributes 0, not negative.
    // Section B: full marks, weighted 50% -- contributes 50.
    const summary = computeResult(
      [{ questionId: 'a1', marksAwarded: -3 }, { questionId: 'b1', marksAwarded: 5 }],
      [{ id: 'a1', marks: 2 }, { id: 'b1', marks: 5 }],
      40,
      [
        { sectionId: 'A', weightPercent: 50, questionIds: ['a1'] },
        { sectionId: 'B', weightPercent: 50, questionIds: ['b1'] },
      ],
    );
    expect(summary.percentage).toBe(50);
    expect(summary.passFail).toBe('pass');
  });

  it('contributes zero for a section with no marks available, without dividing by zero', () => {
    const summary = computeResult(
      [{ questionId: 'a1', marksAwarded: 5 }],
      [{ id: 'a1', marks: 5 }],
      40,
      [
        { sectionId: 'A', weightPercent: 50, questionIds: ['a1'] },
        { sectionId: 'B', weightPercent: 50, questionIds: [] }, // empty section, e.g. all-code section pre-manual-grading
      ],
    );
    expect(summary.percentage).toBe(50); // only A's 50% contributes; B's 50% share earns 0
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npm test --workspace=apps/exam-runtime -- grading.spec.ts
```
Expected: FAIL — `computeResult` called with 4 args but only accepts 3 (TypeScript compile error under ts-jest).

- [ ] **Step 3: Implement**

Replace `computeResult` in `apps/exam-runtime/src/grading/grading.ts` (currently lines 26–44):

```ts
export interface ResultSummary {
  score: number;
  maxScore: number;
  percentage: number;
  passFail: 'pass' | 'fail';
}

export interface GradableSection {
  sectionId: string;
  weightPercent: number;
  questionIds: string[];
}

export function computeResult(
  gradedAnswers: { questionId: string; marksAwarded: number }[],
  questions: { id: string; marks: number }[],
  passCriteriaPercent: number,
  sections: GradableSection[],
): ResultSummary {
  const rawScore = gradedAnswers.reduce((sum, answer) => sum + answer.marksAwarded, 0);
  const score = Math.max(0, rawScore);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);

  const marksAwardedByQuestionId = new Map(gradedAnswers.map((answer) => [answer.questionId, answer.marksAwarded]));
  const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

  // Weighted, not flat: each section's (score/max) ratio contributes its own weightPercent share
  // of the overall percentage, independent of how many raw marks that section's questions carry.
  // See docs/superpowers/specs/2026-08-05-section-weightage-design.md.
  let percentage = 0;
  for (const section of sections) {
    let sectionScore = 0;
    let sectionMax = 0;
    for (const questionId of section.questionIds) {
      sectionScore += marksAwardedByQuestionId.get(questionId) ?? 0;
      sectionMax += marksByQuestionId.get(questionId) ?? 0;
    }
    sectionScore = Math.max(0, sectionScore);
    if (sectionMax > 0) {
      percentage += (sectionScore / sectionMax) * section.weightPercent;
    }
  }

  const passFail: 'pass' | 'fail' = percentage >= passCriteriaPercent ? 'pass' : 'fail';
  return { score, maxScore, percentage, passFail };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test --workspace=apps/exam-runtime -- grading.spec.ts
```
Expected: PASS, full file.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/grading/grading.ts apps/exam-runtime/src/grading/grading.spec.ts
git commit -m "feat(grading): compute the weighted (not flat) exam percentage"
```

---

### Task 7: `attempt-settlement.service.ts` — both call sites become section-aware

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts:1-260,196-260` (`finalize`, `finalizeManualGrade`)
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts` (~24 existing test fixtures — see Step 1)

**Interfaces:**
- Consumes: `computeResult` (Task 6), `Attempt.sectionSnapshotJson` (existing column, not yet including `weightPercent` — Task 8 adds that; this task's local `SectionSnapshotEntry` type tolerates its absence via `?? 0` for now, since Task 8 lands right after and is what actually stamps real values into new attempts).

- [ ] **Step 1: Update every existing fixture in the spec file that reaches `computeResult`**

Every mocked `attempt` object passed to `service.finalize(...)` or `service.finalizeManualGrade(...)` needs a `sectionSnapshotJson` field: one section, `weightPercent: 100`, `questionIds` equal to the same array already passed to `questionOrderJson` for that test. This keeps every existing assertion's expected `percentage`/`passFail` numbers unchanged (one section at 100% weight covering every question makes the weighted formula identical to the old flat one).

**Exceptions — these do NOT need it** because they return before `computeResult` is reached:
- `settleIfExpired`: `'leaves an in-progress attempt untouched...'` (line ~92) and `'leaves an already-submitted attempt untouched...'` (line ~107).
- `finalize`: `'is idempotent against a concurrent settlement race...'` (line ~253) — short-circuits on an existing `Result`.
- `finalizeManualGrade`: `'throws when a code question still has no marksAwarded'` (line ~616) and `'still rejects finalization when the code question only has the blank Answer row...'` (line ~676) — both throw before reaching `computeResult`.

Two fully worked examples of the transformation:

Before (line 163, `finalize` describe block):
```ts
    it('grades an unanswered question as zero marks without creating an answer row', async () => {
      const attempt = { id: 'attempt-1', questionOrderJson: JSON.stringify(['q1']) };
```
After:
```ts
    it('grades an unanswered question as zero marks without creating an answer row', async () => {
      const attempt = {
        id: 'attempt-1',
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section', targetDurationMinutes: null, weightPercent: 100, questionIds: ['q1'] }]),
      };
```

Before (line 643, `finalizeManualGrade` describe block):
```ts
    it('recomputes the Result and settles the attempt once every code question is graded', async () => {
      const attempt = {
        id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'pending_manual_grade',
        questionOrderJson: JSON.stringify(['q1', 'q2']),
      };
```
After:
```ts
    it('recomputes the Result and settles the attempt once every code question is graded', async () => {
      const attempt = {
        id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'pending_manual_grade',
        questionOrderJson: JSON.stringify(['q1', 'q2']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 's1', title: 'Section', targetDurationMinutes: null, weightPercent: 100, questionIds: ['q1', 'q2'] }]),
      };
```

Apply this same transformation to every other `attempt` object literal within the `describe('finalize', ...)` (lines ~162–613) and `describe('finalizeManualGrade', ...)` (lines ~615–796) blocks, using each test's own existing `questionOrderJson` array as the new snapshot's `questionIds` verbatim. Use this to locate every remaining one:
```bash
grep -n "questionOrderJson: JSON.stringify" apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts
```

- [ ] **Step 2: Run the full spec file to confirm every fixture was updated correctly**

```bash
npm test --workspace=apps/exam-runtime -- attempt-settlement.service.spec.ts
```
Expected at this point: FAIL — the fixtures are updated but the implementation isn't yet (JSON.parse on `undefined` or a stale 3-arg `computeResult` call). Confirms the tests are actually exercising the new code path before you implement it.

- [ ] **Step 3: Implement — `finalize()`**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, add the import and a local type near the top (after the existing imports, before `BROWSER_ACTIVITY_COOLDOWN_MS`):

```ts
import { gradeAnswer, computeResult, computeRemainingSeconds, GradableSection } from './grading';
```

Add this interface near the file's other local interfaces (next to `SettlementExam`):

```ts
interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  targetDurationMinutes: number | null;
  weightPercent: number;
  questionIds: string[];
}
```

Change `finalize()` (currently lines 72–134): give `gradedAnswers` a `questionId`, and compute `sections` from `attempt.sectionSnapshotJson` right before calling `computeResult`:

```ts
    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, include: { options: true } });
    const existingAnswers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(existingAnswers.map((answer) => [answer.questionId, answer]));

    const hasCodeQuestions = questions.some((question) => question.type === 'code');
    const gradedAnswers: { questionId: string; marksAwarded: number }[] = [];
    for (const question of questions) {
      if (question.type === 'code') {
        if (!answersByQuestionId.has(question.id)) {
          await tx.answer.create({
            data: {
              attemptId: attempt.id,
              questionId: question.id,
              selectedOptionIdsJson: '[]',
              answerText: null,
            },
          });
        }
        continue;
      }
      const answer = answersByQuestionId.get(question.id);
      const selectedOptionIds: string[] = answer ? JSON.parse(answer.selectedOptionIdsJson) : [];
      const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const { isCorrect, marksAwarded } = gradeAnswer(
        { marks: question.marks, negativeMarks: question.negativeMarks, correctOptionIds },
        selectedOptionIds,
      );
      gradedAnswers.push({ questionId: question.id, marksAwarded });
      if (answer) {
        await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, marksAwarded } });
      }
    }

    const scoredQuestions = hasCodeQuestions ? questions.filter((question) => question.type !== 'code') : questions;
    const sectionSnapshot: SectionSnapshotEntry[] = JSON.parse(attempt.sectionSnapshotJson);
    const sections: GradableSection[] = sectionSnapshot.map((section) => ({
      sectionId: section.sectionId,
      weightPercent: section.weightPercent ?? 0,
      questionIds: section.questionIds,
    }));
    const summary = computeResult(gradedAnswers, scoredQuestions, exam.passCriteriaPercent, sections);
```

(Everything after this line in `finalize()` is unchanged.)

- [ ] **Step 4: Implement — `finalizeManualGrade()`**

Change `finalizeManualGrade()` (currently lines 196–221):

```ts
  async finalizeManualGrade(tx: Prisma.TransactionClient, exam: SettlementExam, attempt: Attempt): Promise<Attempt> {
    if (attempt.status !== 'pending_manual_grade') {
      throw new BadRequestException(`Cannot finalize grading — attempt status is "${attempt.status}"`);
    }

    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } } });
    const answers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

    const codeQuestions = questions.filter((question) => question.type === 'code');
    const ungraded = codeQuestions.filter((question) => {
      const answer = answersByQuestionId.get(question.id);
      return !answer || answer.marksAwarded === null;
    });
    if (ungraded.length > 0) {
      throw new BadRequestException(`${ungraded.length} code question(s) still need grading before this attempt can be finalized`);
    }

    const gradedAnswers = questions.map((question) => ({
      questionId: question.id,
      marksAwarded: answersByQuestionId.get(question.id)?.marksAwarded ?? 0,
    }));
    const sectionSnapshot: SectionSnapshotEntry[] = JSON.parse(attempt.sectionSnapshotJson);
    const sections: GradableSection[] = sectionSnapshot.map((section) => ({
      sectionId: section.sectionId,
      weightPercent: section.weightPercent ?? 0,
      questionIds: section.questionIds,
    }));
    const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent, sections);
```

(Everything after this line in `finalizeManualGrade()` is unchanged.)

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test --workspace=apps/exam-runtime -- attempt-settlement.service.spec.ts
```
Expected: PASS, full file (all ~76 tests, not just the ~24 touched by this task — confirms nothing else in this large spec file regressed).

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts
git commit -m "feat(grading): settle attempts using the weighted section formula"
```

---

### Task 8: `attempt.service.ts` — snapshot carries `weightPercent`

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts:62-67,350-383,1364-1416`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts` (~11 `startAttempt`-family fixtures — see Step 1)

**Interfaces:**
- Produces: every newly created `Attempt.sectionSnapshotJson` now includes each entry's real `weightPercent`, which is what Task 7's `finalize`/`finalizeManualGrade` reads.

- [ ] **Step 1: Update the `startAttempt`-family test fixtures**

Search for every place this spec file mocks `examSection.findMany` (these are the sections used to *build* a fresh snapshot, as opposed to fixtures that mock an *already-created* attempt's `sectionSnapshotJson` directly — those don't need touching, since `weightPercent` isn't read by `loadSections`/`buildFeedback`):
```bash
grep -n "examSection: {" apps/exam-runtime/src/attempts/attempt.service.spec.ts
```
For each, add `weightPercent: 100` to every mocked section object (or split sensibly across multiple sections in the one two-section fixture — see below). This is the fixture *input*; only tests that also assert the resulting `sectionSnapshotJson`'s exact shape need their expected value updated too.

One fully worked example — the multi-section fixture (currently around line 964–978) that explicitly asserts the built snapshot:

Before:
```ts
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 20, poolTags: [], questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q2' }] },
          ]),
        },
```
```ts
      const createdData = tx.attempt.create.mock.calls[0][0].data;
      const snapshot = JSON.parse(createdData.sectionSnapshotJson);
      expect(snapshot).toEqual([
        { sectionId: 'section-1', title: 'Section One', targetDurationMinutes: 20, questionIds: ['q1'] },
```

After:
```ts
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 20, weightPercent: 60, poolTags: [], questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 40, poolTags: [], questions: [{ questionId: 'q2' }] },
          ]),
        },
```
```ts
      const createdData = tx.attempt.create.mock.calls[0][0].data;
      const snapshot = JSON.parse(createdData.sectionSnapshotJson);
      expect(snapshot).toEqual([
        { sectionId: 'section-1', title: 'Section One', targetDurationMinutes: 20, weightPercent: 60, questionIds: ['q1'] },
```
(and the corresponding `section-2` expectation two lines below gets `weightPercent: 40` added too).

Apply the equivalent addition (`weightPercent: 100` on the mock, and `weightPercent: 100` in any matching snapshot-equality assertion) to every other `examSection.findMany` fixture found by the grep above — this includes the two tests around lines 846 and 871 that assert `sectionSnapshotJson` content directly (add `weightPercent: 100` to their expected snapshot entries, matching their single-section fixture).

- [ ] **Step 2: Run the spec file to confirm it now fails on the implementation gap, not the fixtures**

```bash
npm test --workspace=apps/exam-runtime -- attempt.service.spec.ts
```
Expected: some failures where a snapshot-equality assertion now expects `weightPercent` but the built snapshot doesn't have it yet — confirms the fixtures are ready and the implementation is next.

- [ ] **Step 3: Update the `SectionSnapshotEntry` interface**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, change the interface (currently lines 62–67):

```ts
interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  targetDurationMinutes: number | null;
  weightPercent: number;
  questionIds: string[];
}
```

- [ ] **Step 4: Include it when building the snapshot**

In the snapshot-building loop (currently lines 356–383), add `weightPercent: section.weightPercent` to the pushed entry:

```ts
        sectionSnapshot.push({
          sectionId: section.id,
          title: section.title,
          targetDurationMinutes: section.targetDurationMinutes,
          weightPercent: section.weightPercent,
          questionIds,
        });
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test --workspace=apps/exam-runtime -- attempt.service.spec.ts
```
Expected: PASS, full file.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat(exam-runtime): stamp each section's weightPercent into the attempt snapshot"
```

---

### Task 9: `reports.service.ts` — surface `weightPercent` in section score DTOs

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts:39-50,538-552`
- Modify: `apps/api/src/reports/reports.service.spec.ts`

**Interfaces:**
- Produces: `SectionScore.weightPercent: number` (extends the existing `SectionScore`/`CandidateDetailSection` DTOs returned by `getCandidateDetail` and `compareCandidates`), consumed by Task 11's frontend display.

- [ ] **Step 1: Find and update the existing `computeSectionScores` test fixtures**

```bash
grep -n "sectionSnapshotJson\|computeSectionScores\|SectionScore" apps/api/src/reports/reports.service.spec.ts
```
Read the matched fixtures first (they mock `attempt.sectionSnapshotJson` similarly to the exam-runtime tests above — objects with `sectionId`/`title`/`questionIds`). Add `weightPercent: 100` (or split appropriately for multi-section fixtures) to each mocked snapshot entry, and add the matching `weightPercent` value to any assertion that checks the returned `sections`/`sectionScores` array's exact shape.

- [ ] **Step 2: Run the spec file to confirm it fails on the implementation gap**

```bash
npm test --workspace=apps/api -- reports.service.spec.ts
```
Expected: failures on the specific assertions now expecting `weightPercent` in the returned section score objects.

- [ ] **Step 3: Update the local interfaces and `computeSectionScores`**

In `apps/api/src/reports/reports.service.ts`, update `SectionScore` and `SectionSnapshotEntryShape` (currently lines 39–50):

```ts
export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
  weightPercent: number;
}

interface SectionSnapshotEntryShape {
  sectionId: string;
  title: string;
  weightPercent: number;
  questionIds: string[];
}
```

Update `computeSectionScores` (currently lines 538–552) to pass the value through:

```ts
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
      return { sectionId: section.sectionId, title: section.title, score: Math.max(0, score), maxScore, weightPercent: section.weightPercent };
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test --workspace=apps/api -- reports.service.spec.ts
```
Expected: PASS, full file.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/reports.service.ts apps/api/src/reports/reports.service.spec.ts
git commit -m "feat(reports): include section weightPercent in candidate detail/compare DTOs"
```

---

### Task 10: Frontend — types, `useUpdateSection` hook, `ExamSectionsPanel` weight editing

**Files:**
- Modify: `apps/web/lib/types.ts:102-118`
- Modify: `apps/web/lib/hooks/useExamSections.ts`
- Modify: `apps/web/components/ExamSectionsPanel.tsx`
- Create/modify: `apps/web/components/ExamSectionsPanel.test.tsx` (check if this file already exists first: `ls apps/web/components/ExamSectionsPanel.test.tsx`)

**Interfaces:**
- Consumes: `ExamSection.weightPercent` (Task 1/3/4), `PATCH /exams/:id/sections/:sectionId` accepting `weightPercent` (Task 4).
- Produces: `useUpdateSection(examId, sectionId)` hook, reusable by any future section-editing UI.

- [ ] **Step 1: Add `weightPercent` to the `ExamSection` type**

In `apps/web/lib/types.ts`, add to the `ExamSection` interface (currently lines 102–118, right after `targetDurationMinutes`):

```ts
export interface ExamSection {
  id: string;
  examId: string;
  title: string;
  orderIndex: number;
  selectionMode: 'fixed' | 'pool';
  poolSize: number | null;
  poolDifficulty: Difficulty | null;
  targetDurationMinutes: number | null;
  weightPercent: number;
  // ... rest unchanged
```

- [ ] **Step 2: Add `useUpdateSection`**

In `apps/web/lib/hooks/useExamSections.ts`, add this export (after `useCreateSection`):

```ts
export function useUpdateSection(examId: string, sectionId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { weightPercent: number }) =>
      apiFetch(`/exams/${examId}/sections/${sectionId}`, { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams', examId] }),
  });
}
```

- [ ] **Step 3: Write failing tests for `ExamSectionsPanel`'s weight UI**

Check whether `apps/web/components/ExamSectionsPanel.test.tsx` already exists:
```bash
ls apps/web/components/ExamSectionsPanel.test.tsx
```
If it exists, read it fully first to match its existing mock-fetch/render helper conventions before adding to it. If it doesn't exist, create it following the same pattern as `apps/web/components/ManageWalkInGroupModal.test.tsx` (QueryProvider + ToastProvider wrapper, `jest.mock('../lib/auth-context', ...)`, a `global.fetch` mock keyed by URL suffix/method). Add these test cases (adapt the exact mock-fetch shape to whatever convention the existing file already uses, or to the `ManageWalkInGroupModal.test.tsx` pattern if creating fresh):

```ts
  it('shows each section\'s weight and a running total', async () => {
    mockFetch(); // exam with two sections, weightPercent 60 and 40
    renderPanel();

    expect(await screen.findByLabelText('Weight % for Section One')).toHaveValue(60);
    expect(screen.getByLabelText('Weight % for Section Two')).toHaveValue(40);
    expect(screen.getByText('Weights total: 100%')).toBeInTheDocument();
  });

  it('shows a warning banner when weights do not sum to 100', async () => {
    mockFetch(); // exam with two sections, weightPercent 60 and 20 (sums to 80)
    renderPanel();

    expect(await screen.findByText(/Weights total: 80% — add 20% more before publishing/)).toBeInTheDocument();
  });

  it('saves a section\'s new weight on blur', async () => {
    const fetchMock = mockFetch((url, options) =>
      url.endsWith('/sections/section-1') && options?.method === 'PATCH'
        ? new Response(JSON.stringify({ id: 'section-1', weightPercent: 70 }), { status: 200 })
        : null,
    );
    renderPanel();
    const input = await screen.findByLabelText('Weight % for Section One');

    await userEvent.clear(input);
    await userEvent.type(input, '70');
    await userEvent.tab(); // triggers blur

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/sections/section-1') && call[1]?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      expect(JSON.parse(String(patchCall![1]?.body))).toEqual({ weightPercent: 70 });
    });
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
npm test --workspace=apps/web -- ExamSectionsPanel
```
Expected: FAIL — no such label/text exists yet.

- [ ] **Step 5: Implement the weight input and running-total banner**

In `apps/web/components/ExamSectionsPanel.tsx`:

Add the import (alongside the existing `useCreateSection` etc. import block):
```ts
import {
  useCreateSection,
  useDeleteSection,
  useDuplicateSection,
  useReplaceSectionQuestions,
  useUpdateSection,
  usePoolPreview,
} from '../lib/hooks/useExamSections';
```

Add a small per-section weight-input component above `export function ExamSectionsPanel`:

```tsx
function SectionWeightInput({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const updateSection = useUpdateSection(examId, section.id);
  const { toast } = useToast();
  const [value, setValue] = useState(String(section.weightPercent));

  if (locked) {
    return <span className="text-sm text-recruiter-text-secondary">{section.weightPercent}% weight</span>;
  }

  function handleBlur() {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100 || parsed === section.weightPercent) {
      setValue(String(section.weightPercent));
      return;
    }
    updateSection.mutate(
      { weightPercent: parsed },
      { onError: (error) => {
          toast(error instanceof Error ? error.message : 'Failed to update weight.', 'error');
          setValue(String(section.weightPercent));
        } },
    );
  }

  return (
    <label className="flex items-center gap-1 text-sm text-recruiter-text-secondary">
      Weight
      <input
        type="number"
        min={0}
        max={100}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        aria-label={`Weight % for ${section.title}`}
        className="w-16 rounded border border-recruiter-border px-1.5 py-0.5 text-right"
      />
      %
    </label>
  );
}
```

In `ExamSectionsPanel`, compute the running total and render the banner + per-section input. Add right after the `locked`/`lockedMessage` declarations:

```tsx
  const sections = (exam?.sections ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const weightTotal = sections.reduce((sum, section) => sum + section.weightPercent, 0);
```

Render the banner right before the sections list (after the `{!locked && <form ...>}` block):

```tsx
      {!locked && sections.length > 0 && (
        <p className={`text-sm font-medium ${weightTotal === 100 ? 'text-status-success' : 'text-status-warning'}`}>
          {weightTotal === 100
            ? `Weights total: ${weightTotal}%`
            : `Weights total: ${weightTotal}% — add ${100 - weightTotal}% more before publishing`}
        </p>
      )}
```

Add the `SectionWeightInput` into each section card's header row, next to the title (currently `<p className="font-medium">{section.title}</p>`):

```tsx
              <div className="flex items-center gap-2">
                <p className="font-medium">{section.title}</p>
                <SectionWeightInput examId={examId} section={section} locked={locked} />
              </div>
```

And change the `.map((section) =>` call to iterate the already-sorted `sections` array instead of re-deriving it inline:
```tsx
      {sections.map((section) => (
```
(removing the old inline `(exam?.sections ?? []).slice().sort(...)` chain since it's now the `sections` variable declared above).

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npm test --workspace=apps/web -- ExamSectionsPanel
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useExamSections.ts apps/web/components/ExamSectionsPanel.tsx apps/web/components/ExamSectionsPanel.test.tsx
git commit -m "feat(web): edit section weights in ExamSectionsPanel with a running-total banner"
```

---

### Task 11: Frontend — `CandidateReportPanel` shows weight% next to each section's score

**Files:**
- Modify: `apps/web/lib/types.ts` (`SectionScore` interface, currently lines 516–521)
- Modify: `apps/web/components/CandidateReportPanel.tsx:283-287`
- Modify: `apps/web/components/CandidateReportPanel.test.tsx` (check if it exists: `ls apps/web/components/CandidateReportPanel.test.tsx`)

**Interfaces:**
- Consumes: `SectionScore.weightPercent` (Task 9).

- [ ] **Step 1: Add `weightPercent` to the frontend `SectionScore` type**

In `apps/web/lib/types.ts`, update the interface (currently lines 516–521):

```ts
export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
  weightPercent: number;
}
```

- [ ] **Step 2: Write the failing test**

Check whether `apps/web/components/CandidateReportPanel.test.tsx` already exists and read it first to match conventions:
```bash
ls apps/web/components/CandidateReportPanel.test.tsx
```
Add (or create following the file's existing render-helper pattern) a test asserting the weight is shown:

```ts
  it("shows each section's weight percentage next to its raw score", async () => {
    // candidate fixture includes a section: { sectionId: 's1', title: 'Coding', score: 45, maxScore: 60, weightPercent: 60, questions: [] }
    renderPanel();

    expect(await screen.findByText('45/60 · 60% weight')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npm test --workspace=apps/web -- CandidateReportPanel
```
Expected: FAIL — text not found.

- [ ] **Step 4: Implement**

In `apps/web/components/CandidateReportPanel.tsx`, change the section score display (currently lines 283–287):

```tsx
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-medium">{section.title}</h3>
                <span className="text-sm text-gray-500">
                  {section.score}/{section.maxScore} · {section.weightPercent}% weight
                </span>
              </div>
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npm test --workspace=apps/web -- CandidateReportPanel
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/types.ts apps/web/components/CandidateReportPanel.tsx apps/web/components/CandidateReportPanel.test.tsx
git commit -m "feat(web): show section weight percentage in the candidate report panel"
```

---

### Final verification (after all tasks)

Run each workspace's full suite sequentially (per this project's established environment note: concurrent suite runs produce phantom failures on this machine — always run them one at a time):

```bash
npm test --workspace=apps/api
npm test --workspace=apps/exam-runtime
npm test --workspace=apps/web
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
npm run build --workspace=apps/web
```

Then live-verify per this session's established browser-testing workflow: create a 2-section exam, confirm the first section defaults to 100%, add a second section (confirm it defaults to 0% and the banner turns amber), set both to sum to 100, publish, take the exam as a candidate with a deliberately uneven score split across the two sections, and confirm the recruiter's report shows the weighted percentage (not the flat one) driving pass/fail.
