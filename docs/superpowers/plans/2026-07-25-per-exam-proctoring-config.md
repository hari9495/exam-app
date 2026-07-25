# Per-Exam Proctoring Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let recruiters choose, per exam, which anti-cheating measures apply — webcam on/off, whether violations pause/block or are only recorded, the strike limit, and which of the 8 browser signals are watched — editable before publish and locked once candidates are invited.

**Architecture:** Four new columns on `Exam` carry the config. `apps/api` exposes them through the existing exam create/update DTO and enforces the publish+invited lock. `apps/exam-runtime` resolves them into a single `ExamProctoringConfig` object that is (a) sent to the candidate browser in both `/attempt/current` response shapes so the client can stop emitting disabled signals, and (b) applied authoritatively server-side at ingestion and in the strike logic, so a stale or tampered client cannot bypass anything. The candidate hooks receive the config through a `useRef` mirror rather than a widened dependency array.

**Tech Stack:** NestJS, Prisma (SQL Server), Next.js App Router, React Query, Jest, Playwright.

## Global Constraints

- Defaults must exactly reproduce today's behaviour: `webcamProctoringEnabled = true`, `proctoringEnforcement = 'block'`, `proctoringStrikeLimit = 3`, no disabled signals. Existing exams must behave identically after this change.
- The set of toggleable signals is exactly the 8 strike-worthy types in `STRIKE_WORTHY_EVENT_TYPES` (`apps/exam-runtime/src/attempts/proctoring-severity.ts:33-42`): `tab_switch`, `window_blur`, `fullscreen_exit`, `copy_paste`, `right_click`, `dev_tools_detected`, `multi_monitor_detected`, `idle_timeout`.
- `editor_paste`, `refresh_warning`, `webcam_snapshot` and `looking_down` are NOT toggleable. `editor_paste` is integrity telemetry feeding the integrity report, not a strike signal; `looking_down` is webcam-derived and therefore governed by `webcamProctoringEnabled`. Do not gate `useEditorTelemetry`.
- The server is authoritative. A disabled signal arriving at `POST /attempt/proctoring-event` must be **ignored silently** (HTTP 200, no `ProctoringEvent` row, no strike, no gateway emit) — never a 400, so a stale client cannot break a live exam.
- `'warn'` enforcement records the event and increments the counter but never sets `status` to `paused`/`blocked` and never sets `pausedAt`. Recruiter-facing copy for this mode is "Record only — never pause the exam", because the candidate is deliberately not interrupted.
- Violation counters reset **only** on the recruiter unblock path, never on candidate self-resume (`POST /attempt/webcam-resume`) — resetting on self-resume would let a candidate farm unlimited strikes.
- New SQL Server columns use the existing `exams` migration style: `BIT NOT NULL CONSTRAINT [exams_<col>_df] DEFAULT 0|1`. Never reference a column added in the same migration file (documented SQL Server batch-compile gotcha).
- `apps/web/lib/types.ts` is a hand-maintained mirror of the exam-runtime response types with no shared package. `AttemptPreview` and `AttemptState` must be updated in lockstep with `AttemptPreviewResponse` and `AttemptStateResponse`.
- Canonical wire shape, used verbatim on both sides:
  ```ts
  interface ExamProctoringConfig {
    webcamEnabled: boolean;
    enforcement: 'warn' | 'block';
    strikeLimit: number;
    disabledSignals: string[];
  }
  ```

---

### Task 1: Schema and migration for the four config columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma:252-274` (model `Exam`)
- Create: `apps/api/prisma/migrations/20260725120000_exam_proctoring_config/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma `Exam` model fields `webcamProctoringEnabled: boolean`, `proctoringEnforcement: string`, `proctoringStrikeLimit: number`, `disabledProctoringSignalsJson: string | null`. Every later task reads these.

- [ ] **Step 1: Add the four fields to the Exam model**

In `apps/api/prisma/schema.prisma`, inside `model Exam`, insert these four lines immediately after the `allowedIpRange` line and before `createdBy`:

```prisma
  webcamProctoringEnabled Boolean       @default(true) @map("webcam_proctoring_enabled")
  proctoringEnforcement   String        @default("block") @map("proctoring_enforcement")
  proctoringStrikeLimit   Int           @default(3) @map("proctoring_strike_limit")
  disabledProctoringSignalsJson String? @map("disabled_proctoring_signals_json") @db.NVarChar(Max)
```

- [ ] **Step 2: Write the migration**

Create `apps/api/prisma/migrations/20260725120000_exam_proctoring_config/migration.sql` with exactly:

```sql
ALTER TABLE [dbo].[exams] ADD [webcam_proctoring_enabled] BIT NOT NULL CONSTRAINT [exams_webcam_proctoring_enabled_df] DEFAULT 1;
ALTER TABLE [dbo].[exams] ADD [proctoring_enforcement] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_proctoring_enforcement_df] DEFAULT 'block';
ALTER TABLE [dbo].[exams] ADD [proctoring_strike_limit] INT NOT NULL CONSTRAINT [exams_proctoring_strike_limit_df] DEFAULT 3;
ALTER TABLE [dbo].[exams] ADD [disabled_proctoring_signals_json] NVARCHAR(MAX);
```

Four independent `ALTER ... ADD` statements, no statement referencing a column added above it — this is what makes the file safe on SQL Server.

- [ ] **Step 3: Apply the migration locally and regenerate the client**

Run from the repo root:

```bash
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && npx prisma generate --schema=apps/api/prisma/schema.prisma
```

Expected: `All migrations have been successfully applied.` followed by `Generated Prisma Client`.

- [ ] **Step 4: Verify the generated client knows the fields**

Run:

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
```

Expected: no output (clean). If `Property 'webcamProctoringEnabled' does not exist` appears anywhere, `prisma generate` did not pick up the schema — re-run Step 3.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260725120000_exam_proctoring_config
git commit -m "feat: add per-exam proctoring config columns"
```

---

### Task 2: Expose the config through the exam DTO and persist it

**Files:**
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts` (add fields + two const tuples)
- Modify: `apps/api/src/exams/exams.service.ts` — `create()` at :104-122, `update()` at :216-232, `duplicate()` at :304-336
- Test: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Consumes: Prisma `Exam` fields from Task 1.
- Produces: `CreateExamDto` (and by inheritance `UpdateExamDto`) accepting `webcamProctoringEnabled?: boolean`, `proctoringEnforcement?: string`, `proctoringStrikeLimit?: number`, `disabledProctoringSignals?: string[]`. Exported consts `PROCTORING_ENFORCEMENT_VALUES` and `TOGGLEABLE_PROCTORING_SIGNALS` — Task 10's UI imports the latter for its checkbox list.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/exams/exams.service.spec.ts`, inside the top-level `describe('ExamsService', ...)`:

```ts
  describe('proctoring config', () => {
    it('persists all four proctoring fields on create, serialising disabled signals as JSON', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', {
        title: 'Screen',
        webcamProctoringEnabled: false,
        proctoringEnforcement: 'warn',
        proctoringStrikeLimit: 5,
        disabledProctoringSignals: ['right_click', 'idle_timeout'],
      });

      expect(tx.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            webcamProctoringEnabled: false,
            proctoringEnforcement: 'warn',
            proctoringStrikeLimit: 5,
            disabledProctoringSignalsJson: JSON.stringify(['right_click', 'idle_timeout']),
          }),
        }),
      );
    });

    it('leaves the proctoring columns to their schema defaults when the caller omits them', async () => {
      const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.create(context, 'user-1', { title: 'Screen' });

      const data = tx.exam.create.mock.calls[0][0].data;
      expect(data.webcamProctoringEnabled).toBeUndefined();
      expect(data.proctoringEnforcement).toBeUndefined();
      expect(data.proctoringStrikeLimit).toBeUndefined();
      expect(data.disabledProctoringSignalsJson).toBeUndefined();
    });

    it('updates only the proctoring fields that were supplied', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'exam-1', { title: 'Screen', proctoringStrikeLimit: 2 });

      const data = tx.exam.update.mock.calls[0][0].data;
      expect(data.proctoringStrikeLimit).toBe(2);
      expect(data).not.toHaveProperty('webcamProctoringEnabled');
      expect(data).not.toHaveProperty('disabledProctoringSignalsJson');
    });

    it('clears the disabled-signal list when an empty array is supplied', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        },
        invitation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'exam-1', { title: 'Screen', disabledProctoringSignals: [] });

      expect(tx.exam.update.mock.calls[0][0].data.disabledProctoringSignalsJson).toBeNull();
    });

    it('rejects changing proctoring config on a published exam that already has invited candidates', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }), update: jest.fn() },
        invitation: { count: jest.fn().mockResolvedValue(2) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.update(context, 'exam-1', { title: 'Screen', proctoringStrikeLimit: 2 })).rejects.toThrow(
        ConflictException,
      );
      expect(tx.exam.update).not.toHaveBeenCalled();
    });

    it('allows non-proctoring edits on a published exam with invited candidates', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
          update: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        },
        invitation: { count: jest.fn().mockResolvedValue(2), findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.update(context, 'exam-1', { title: 'Renamed' });

      expect(tx.exam.update).toHaveBeenCalled();
    });

    it('carries the proctoring config onto a duplicated exam', async () => {
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1',
            title: 'Screen',
            instructions: null,
            durationMinutes: 45,
            passCriteriaPercent: 60,
            randomizeOrder: false,
            feedbackVisibility: 'score',
            schedulingEnabled: false,
            availabilityWindowStart: null,
            availabilityWindowEnd: null,
            webcamProctoringEnabled: false,
            proctoringEnforcement: 'warn',
            proctoringStrikeLimit: 5,
            disabledProctoringSignalsJson: JSON.stringify(['right_click']),
            sections: [],
          }),
          create: jest.fn().mockResolvedValue({ id: 'exam-2' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.duplicate(context, 'user-1', 'exam-1');

      expect(tx.exam.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            webcamProctoringEnabled: false,
            proctoringEnforcement: 'warn',
            proctoringStrikeLimit: 5,
            disabledProctoringSignalsJson: JSON.stringify(['right_click']),
          }),
        }),
      );
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest exams.service -t "proctoring config"`
Expected: FAIL — the create/update assertions fail because the fields are never mapped, and the lock test fails because no `ConflictException` is thrown.

- [ ] **Step 3: Add the DTO fields**

In `apps/api/src/exams/dto/create-exam.dto.ts`, change the import line to add `IsArray` and `ArrayUnique`:

```ts
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
```

Add these two exported consts directly below the existing `FEEDBACK_VISIBILITY_VALUES` line:

```ts
export const PROCTORING_ENFORCEMENT_VALUES = ['warn', 'block'] as const;

// Exactly the strike-worthy browser signals. Webcam signals are governed by
// webcamProctoringEnabled; editor_paste/refresh_warning are telemetry, not strikes.
export const TOGGLEABLE_PROCTORING_SIGNALS = [
  'tab_switch',
  'window_blur',
  'fullscreen_exit',
  'copy_paste',
  'right_click',
  'dev_tools_detected',
  'multi_monitor_detected',
  'idle_timeout',
] as const;
```

Append these four fields inside `CreateExamDto`, after `allowedIpRange`:

```ts
  @IsOptional()
  @IsBoolean()
  webcamProctoringEnabled?: boolean;

  @IsOptional()
  @IsIn(PROCTORING_ENFORCEMENT_VALUES)
  proctoringEnforcement?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  proctoringStrikeLimit?: number;

  // An empty array explicitly means "watch every signal" and clears the column.
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(TOGGLEABLE_PROCTORING_SIGNALS, { each: true })
  disabledProctoringSignals?: string[];
```

- [ ] **Step 4: Map the fields in create()**

In `apps/api/src/exams/exams.service.ts`, inside `create()`'s `tx.exam.create({ data: {...} })`, add these four lines immediately after `allowedIpRange: dto.allowedIpRange ?? null,`:

```ts
          ...(dto.webcamProctoringEnabled !== undefined ? { webcamProctoringEnabled: dto.webcamProctoringEnabled } : {}),
          ...(dto.proctoringEnforcement !== undefined ? { proctoringEnforcement: dto.proctoringEnforcement } : {}),
          ...(dto.proctoringStrikeLimit !== undefined ? { proctoringStrikeLimit: dto.proctoringStrikeLimit } : {}),
          ...(dto.disabledProctoringSignals !== undefined
            ? { disabledProctoringSignalsJson: dto.disabledProctoringSignals.length > 0 ? JSON.stringify(dto.disabledProctoringSignals) : null }
            : {}),
```

- [ ] **Step 5: Add the lock check and mapping in update()**

In `update()`, immediately after the `if (!existing) { throw new NotFoundException(...) }` block, insert:

```ts
      // Proctoring rules must not change once candidates have been invited to a
      // published exam -- otherwise candidates in the same exam are judged by
      // different rules, which is indefensible if a hiring decision is challenged.
      const touchesProctoringConfig =
        dto.webcamProctoringEnabled !== undefined ||
        dto.proctoringEnforcement !== undefined ||
        dto.proctoringStrikeLimit !== undefined ||
        dto.disabledProctoringSignals !== undefined;
      if (touchesProctoringConfig) {
        await this.assertSectionsMutable(tx, id, existing.status);
      }
```

Then inside the same method's `tx.exam.update({ data: {...} })`, add after the `allowedIpRange` spread:

```ts
          ...(dto.webcamProctoringEnabled !== undefined ? { webcamProctoringEnabled: dto.webcamProctoringEnabled } : {}),
          ...(dto.proctoringEnforcement !== undefined ? { proctoringEnforcement: dto.proctoringEnforcement } : {}),
          ...(dto.proctoringStrikeLimit !== undefined ? { proctoringStrikeLimit: dto.proctoringStrikeLimit } : {}),
          ...(dto.disabledProctoringSignals !== undefined
            ? { disabledProctoringSignalsJson: dto.disabledProctoringSignals.length > 0 ? JSON.stringify(dto.disabledProctoringSignals) : null }
            : {}),
```

- [ ] **Step 6: Copy the fields in duplicate()**

In `duplicate()`, inside the `tx.exam.create({ data: {...} })` that builds the clone, add after `feedbackVisibility: exam.feedbackVisibility,`:

```ts
          webcamProctoringEnabled: exam.webcamProctoringEnabled,
          proctoringEnforcement: exam.proctoringEnforcement,
          proctoringStrikeLimit: exam.proctoringStrikeLimit,
          disabledProctoringSignalsJson: exam.disabledProctoringSignalsJson,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/api && npx jest exams.service`
Expected: PASS, all tests in the file including the 7 new ones.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exams/dto/create-exam.dto.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat: accept and persist per-exam proctoring config"
```

---

### Task 3: Pure resolver turning an Exam row into ExamProctoringConfig

**Files:**
- Create: `apps/exam-runtime/src/attempts/proctoring-config.ts`
- Test: `apps/exam-runtime/src/attempts/proctoring-config.spec.ts`

**Interfaces:**
- Consumes: Prisma `Exam` fields from Task 1.
- Produces: `export interface ExamProctoringConfig { webcamEnabled: boolean; enforcement: 'warn' | 'block'; strikeLimit: number; disabledSignals: string[] }`, `export function resolveProctoringConfig(exam: ProctoringConfigSource): ExamProctoringConfig`, `export function isSignalEnabled(config: ExamProctoringConfig, eventType: string): boolean`, and `export interface ProctoringConfigSource { webcamProctoringEnabled: boolean; proctoringEnforcement: string; proctoringStrikeLimit: number; disabledProctoringSignalsJson: string | null }`. Tasks 4, 5 and 6 all consume these.

- [ ] **Step 1: Write the failing test**

Create `apps/exam-runtime/src/attempts/proctoring-config.spec.ts`:

```ts
import { resolveProctoringConfig, isSignalEnabled } from './proctoring-config';

function source(overrides: Partial<Parameters<typeof resolveProctoringConfig>[0]> = {}) {
  return {
    webcamProctoringEnabled: true,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 3,
    disabledProctoringSignalsJson: null,
    ...overrides,
  };
}

describe('resolveProctoringConfig', () => {
  it("reproduces today's behaviour for an exam left on the schema defaults", () => {
    expect(resolveProctoringConfig(source())).toEqual({
      webcamEnabled: true,
      enforcement: 'block',
      strikeLimit: 3,
      disabledSignals: [],
    });
  });

  it('parses the disabled-signal JSON array', () => {
    const config = resolveProctoringConfig(source({ disabledProctoringSignalsJson: '["right_click","idle_timeout"]' }));

    expect(config.disabledSignals).toEqual(['right_click', 'idle_timeout']);
  });

  it('falls back to watching every signal when the stored JSON is malformed, rather than throwing mid-exam', () => {
    const config = resolveProctoringConfig(source({ disabledProctoringSignalsJson: '{not json' }));

    expect(config.disabledSignals).toEqual([]);
  });

  it('ignores stored JSON that parses but is not an array of strings', () => {
    expect(resolveProctoringConfig(source({ disabledProctoringSignalsJson: '{"a":1}' })).disabledSignals).toEqual([]);
    expect(resolveProctoringConfig(source({ disabledProctoringSignalsJson: '[1,2]' })).disabledSignals).toEqual([]);
  });

  it('treats any unrecognised enforcement value as block, so a bad row never silently disables enforcement', () => {
    expect(resolveProctoringConfig(source({ proctoringEnforcement: 'nonsense' })).enforcement).toBe('block');
    expect(resolveProctoringConfig(source({ proctoringEnforcement: 'warn' })).enforcement).toBe('warn');
  });

  it('clamps a nonsensical strike limit to at least 1', () => {
    expect(resolveProctoringConfig(source({ proctoringStrikeLimit: 0 })).strikeLimit).toBe(1);
    expect(resolveProctoringConfig(source({ proctoringStrikeLimit: -4 })).strikeLimit).toBe(1);
  });
});

describe('isSignalEnabled', () => {
  const config = resolveProctoringConfig(source({ disabledProctoringSignalsJson: '["right_click"]' }));

  it('reports a disabled signal as off', () => {
    expect(isSignalEnabled(config, 'right_click')).toBe(false);
  });

  it('reports every other signal as on', () => {
    expect(isSignalEnabled(config, 'tab_switch')).toBe(true);
    expect(isSignalEnabled(config, 'dev_tools_detected')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest proctoring-config`
Expected: FAIL — `Cannot find module './proctoring-config'`.

- [ ] **Step 3: Write the implementation**

Create `apps/exam-runtime/src/attempts/proctoring-config.ts`:

```ts
export interface ProctoringConfigSource {
  webcamProctoringEnabled: boolean;
  proctoringEnforcement: string;
  proctoringStrikeLimit: number;
  disabledProctoringSignalsJson: string | null;
}

export interface ExamProctoringConfig {
  webcamEnabled: boolean;
  enforcement: 'warn' | 'block';
  strikeLimit: number;
  disabledSignals: string[];
}

function parseDisabledSignals(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    // A malformed or unexpected value must degrade to "watch everything" rather
    // than throw -- this runs on every proctoring event of a live exam.
    if (!Array.isArray(parsed)) return [];
    return parsed.every((entry) => typeof entry === 'string') ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveProctoringConfig(exam: ProctoringConfigSource): ExamProctoringConfig {
  return {
    webcamEnabled: exam.webcamProctoringEnabled,
    // Anything other than an explicit 'warn' enforces, so a corrupt row fails safe.
    enforcement: exam.proctoringEnforcement === 'warn' ? 'warn' : 'block',
    strikeLimit: Math.max(1, exam.proctoringStrikeLimit),
    disabledSignals: parseDisabledSignals(exam.disabledProctoringSignalsJson),
  };
}

export function isSignalEnabled(config: ExamProctoringConfig, eventType: string): boolean {
  return !config.disabledSignals.includes(eventType);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/exam-runtime && npx jest proctoring-config`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/proctoring-config.ts apps/exam-runtime/src/attempts/proctoring-config.spec.ts
git commit -m "feat: add proctoring config resolver"
```

---

### Task 4: Send the config to the candidate in both payload shapes

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` — `AttemptPreviewResponse` at :73-88, `AttemptStateResponse` at :104-117, preview builder at :150-166, state builder at :179-198
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts` — `describe('getCurrent')` :89-616

**Interfaces:**
- Consumes: `resolveProctoringConfig`, `ExamProctoringConfig` from Task 3.
- Produces: `AttemptPreviewResponse.exam.proctoring: ExamProctoringConfig` and `AttemptStateResponse.exam.proctoring: ExamProctoringConfig`. Tasks 8 and 9 read these in the browser.

- [ ] **Step 1: Extend the spec's exam fixture**

Open `apps/exam-runtime/src/attempts/attempt.service.spec.ts` and find the exam fixture object that `describe('getCurrent')` relies on. Add these four columns to it so `resolveProctoringConfig` receives real input:

```ts
        webcamProctoringEnabled: true,
        proctoringEnforcement: 'block',
        proctoringStrikeLimit: 3,
        disabledProctoringSignalsJson: null,
```

- [ ] **Step 2: Write the failing tests**

Add both of these inside `describe('getCurrent', ...)`. Match the surrounding tests' arrange/act style — they already set up whether an attempt row exists.

```ts
    it('includes the resolved proctoring config in the pre-start preview, because the welcome screen gates the camera prompt on it', async () => {
      const result = await service.getCurrent({ invitationId: 'inv-1' } as never);

      expect('schedulingWindowState' in result).toBe(true);
      expect((result as { exam: { proctoring: unknown } }).exam.proctoring).toEqual({
        webcamEnabled: true,
        enforcement: 'block',
        strikeLimit: 3,
        disabledSignals: [],
      });
    });

    it('includes the resolved proctoring config in the in-exam state so the client can stop emitting disabled signals', async () => {
      const result = await service.getCurrent({ invitationId: 'inv-1' } as never);

      expect((result as { exam: { title: string; proctoring: unknown } }).exam).toEqual({
        title: expect.any(String),
        proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] },
      });
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest attempt.service -t "proctoring config"`
Expected: FAIL — `exam.proctoring` is `undefined` in both shapes.

- [ ] **Step 4: Add the field to both response interfaces**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, add this import beside the existing `proctoring-severity` import:

```ts
import { resolveProctoringConfig, ExamProctoringConfig } from './proctoring-config';
```

In `AttemptPreviewResponse.exam`, add after `availabilityWindowEnd: Date | null;`:

```ts
    proctoring: ExamProctoringConfig;
```

Change `AttemptStateResponse`'s exam line from `exam: { title: string };` to:

```ts
  exam: { title: string; proctoring: ExamProctoringConfig };
```

- [ ] **Step 5: Populate it in both builders**

In the preview builder, add after `availabilityWindowEnd: exam.availabilityWindowEnd,`:

```ts
            proctoring: resolveProctoringConfig(exam),
```

In the state builder, change `exam: { title: exam.title },` to:

```ts
        exam: { title: exam.title, proctoring: resolveProctoringConfig(exam) },
```

- [ ] **Step 6: Run the whole spec to catch fixture drift**

Run: `cd apps/exam-runtime && npx jest attempt.service`
Expected: PASS. Existing assertions that compare `exam` with a strict `toEqual` will now fail — add the full `proctoring` object to those expected values. Do not weaken them to `expect.objectContaining`.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: send proctoring config to the candidate runtime"
```

---

### Task 5: Ignore disabled signals at ingestion

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` — `reportProctoringEvent()` at :459-511
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts` — `describe('reportProctoringEvent')` at :1415+

**Interfaces:**
- Consumes: `resolveProctoringConfig`, `isSignalEnabled` from Task 3.
- Produces: for a disabled signal, `reportProctoringEvent` resolves to `{ id: '', eventType, severity: 'low', strike: <unchanged count>, status: <unchanged status> }` without writing anything.

- [ ] **Step 1: Write the failing tests**

Add inside `describe('reportProctoringEvent', ...)`. Reuse the identifiers the surrounding tests already use for the tx mock, the exam fixture, the attempt fixture and the monitoring gateway mock — read the block and match them rather than inventing new names.

```ts
    it('silently ignores a signal the exam has disabled -- no event row, no strike, no live flag', async () => {
      examFixture.disabledProctoringSignalsJson = JSON.stringify(['right_click']);
      tx.attempt.findUnique.mockResolvedValue({ ...attemptFixture, browserActivityViolationCount: 1, status: 'in_progress' });

      const result = await service.reportProctoringEvent({ invitationId: 'inv-1' } as never, { eventType: 'right_click' } as never);

      expect(tx.proctoringEvent.create).not.toHaveBeenCalled();
      expect(attemptSettlement.registerBrowserActivityViolation).not.toHaveBeenCalled();
      expect(monitoringGateway.emitProctoringFlag).not.toHaveBeenCalled();
      // Returns unchanged state rather than 400ing: a stale client tab must not be
      // able to fail an exam with errors after the recruiter turns a signal off.
      expect(result).toEqual({ id: '', eventType: 'right_click', severity: 'low', strike: 1, status: 'in_progress' });
    });

    it('still processes a signal that is not in the disabled list', async () => {
      examFixture.disabledProctoringSignalsJson = JSON.stringify(['right_click']);
      tx.attempt.findUnique.mockResolvedValue({ ...attemptFixture, status: 'in_progress' });

      await service.reportProctoringEvent({ invitationId: 'inv-1' } as never, { eventType: 'tab_switch' } as never);

      expect(attemptSettlement.registerBrowserActivityViolation).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest attempt.service -t "disabled"`
Expected: FAIL — the event row is created and a strike is registered.

- [ ] **Step 3: Add the guard**

Extend the Task 4 import to include `isSignalEnabled`:

```ts
import { resolveProctoringConfig, isSignalEnabled, ExamProctoringConfig } from './proctoring-config';
```

In `reportProctoringEvent`, immediately after the `if (!attempt) { throw new NotFoundException('No attempt has been started'); }` block, insert:

```ts
      // The client is told which signals to skip, but the server cannot trust it:
      // a stale bundle or a tampered client would otherwise still land strikes for
      // a signal the recruiter turned off. Ignore rather than reject.
      const proctoring = resolveProctoringConfig(exam);
      if (!isSignalEnabled(proctoring, dto.eventType)) {
        return {
          id: '',
          eventType: dto.eventType,
          severity: 'low',
          strike: attempt.browserActivityViolationCount,
          status: attempt.status,
        };
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest attempt.service`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: ignore proctoring signals disabled for the exam"
```

---

### Task 6: Honour strike limit and warn-only mode in the strike logic

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts` — `SettlementExam` :14-19, `registerWebcamViolation` :237-265, `registerBrowserActivityViolation` :267-303
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` — the `registerBrowserActivityViolation` call at :472, the `webcamViolation` destructure at :514 and its `registerWebcamViolation` call at :525
- Test: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts` — `describe('registerWebcamViolation')` :754-801, `describe('registerBrowserActivityViolation')` :803-923

**Interfaces:**
- Consumes: `resolveProctoringConfig` from Task 3.
- Produces: `SettlementExam` gains the four proctoring columns. New signatures — `registerWebcamViolation(tx, exam, attempt, reason, snapshot)` and `registerBrowserActivityViolation(tx, exam, attempt, eventType, metadata)`, with `exam` inserted as the **second** parameter to match the existing `settleIfExpired(tx, exam, attempt)` ordering.

- [ ] **Step 1: Write the failing tests**

Add this describe block to `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`, matching the file's existing tx-mock name:

```ts
  describe('configurable strike limit and warn-only enforcement', () => {
    const strictExam = {
      id: 'exam-1',
      organizationId: 'org-1',
      durationMinutes: 60,
      passCriteriaPercent: 40,
      webcamProctoringEnabled: true,
      proctoringEnforcement: 'block',
      proctoringStrikeLimit: 2,
      disabledProctoringSignalsJson: null,
    };
    const warnExam = { ...strictExam, proctoringEnforcement: 'warn', proctoringStrikeLimit: 3 };

    it('blocks a browser-activity violation at the exam configured limit of 2 rather than the old hardcoded 3', async () => {
      tx.proctoringEvent.findFirst.mockResolvedValue(null);
      tx.attempt.update.mockResolvedValue({ id: 'a1', examId: 'exam-1', status: 'blocked' });

      const { strike } = await service.registerBrowserActivityViolation(
        tx,
        strictExam,
        { id: 'a1', examId: 'exam-1', candidateId: 'c1', status: 'in_progress', browserActivityViolationCount: 1, pausedDurationMs: 0 } as never,
        'tab_switch',
      );

      expect(strike).toBe(2);
      expect(tx.attempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }));
    });

    it('still only pauses at the first strike when the limit is 2', async () => {
      tx.proctoringEvent.findFirst.mockResolvedValue(null);
      tx.attempt.update.mockResolvedValue({ id: 'a1', examId: 'exam-1', status: 'paused' });

      await service.registerBrowserActivityViolation(
        tx,
        strictExam,
        { id: 'a1', examId: 'exam-1', candidateId: 'c1', status: 'in_progress', browserActivityViolationCount: 0, pausedDurationMs: 0 } as never,
        'tab_switch',
      );

      expect(tx.attempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'paused' }) }));
    });

    it('records and counts but never pauses in warn-only mode, so the candidate is not interrupted', async () => {
      tx.proctoringEvent.findFirst.mockResolvedValue(null);
      tx.attempt.update.mockResolvedValue({ id: 'a1', examId: 'exam-1', status: 'in_progress' });

      const { strike } = await service.registerBrowserActivityViolation(
        tx,
        warnExam,
        { id: 'a1', examId: 'exam-1', candidateId: 'c1', status: 'in_progress', browserActivityViolationCount: 5, pausedDurationMs: 0 } as never,
        'tab_switch',
      );

      expect(tx.proctoringEvent.create).toHaveBeenCalled();
      expect(strike).toBe(6);
      const data = tx.attempt.update.mock.calls[0][0].data;
      expect(data.browserActivityViolationCount).toBe(6);
      expect(data.status).toBe('in_progress');
      expect(data.pausedAt).toBeNull();
    });

    it('blocks a webcam violation at the configured limit and marks it high severity there', async () => {
      tx.attempt.update.mockResolvedValue({ id: 'a1', examId: 'exam-1', status: 'blocked' });

      await service.registerWebcamViolation(
        tx,
        strictExam,
        { id: 'a1', examId: 'exam-1', candidateId: 'c1', webcamViolationCount: 1, pausedDurationMs: 0 } as never,
        'no_face',
        'https://blob/snap.jpg',
      );

      expect(tx.proctoringEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ severity: 'high' }) }),
      );
      expect(tx.attempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }));
    });

    it('never pauses a webcam violation in warn-only mode', async () => {
      tx.attempt.update.mockResolvedValue({ id: 'a1', examId: 'exam-1', status: 'in_progress' });

      await service.registerWebcamViolation(
        tx,
        warnExam,
        { id: 'a1', examId: 'exam-1', candidateId: 'c1', webcamViolationCount: 0, pausedDurationMs: 0 } as never,
        'no_face',
        'https://blob/snap.jpg',
      );

      const data = tx.attempt.update.mock.calls[0][0].data;
      expect(data.status).toBe('in_progress');
      expect(data.pausedAt).toBeNull();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest attempt-settlement -t "configurable strike limit"`
Expected: FAIL — arity/type errors, because both methods currently take `(tx, attempt, ...)` with no exam.

- [ ] **Step 3: Extend SettlementExam**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, add:

```ts
import { resolveProctoringConfig } from '../attempts/proctoring-config';
```

and replace the interface with:

```ts
export interface SettlementExam {
  id: string;
  organizationId: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  webcamProctoringEnabled: boolean;
  proctoringEnforcement: string;
  proctoringStrikeLimit: number;
  disabledProctoringSignalsJson: string | null;
}
```

- [ ] **Step 4: Rewrite registerWebcamViolation**

Replace the whole method with:

```ts
  async registerWebcamViolation(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    reason: WebcamViolationReason,
    snapshot: string,
  ): Promise<{ attempt: Attempt; strike: number }> {
    const { enforcement, strikeLimit } = resolveProctoringConfig(exam);
    const strike = attempt.webcamViolationCount + 1;
    const atLimit = strike >= strikeLimit;
    const eventType =
      reason === 'no_face' ? 'webcam_no_face'
      : reason === 'multiple_faces' ? 'webcam_multiple_faces'
      : 'webcam_head_turned';
    await tx.proctoringEvent.create({
      data: {
        attemptId: attempt.id,
        eventType,
        severity: atLimit ? 'high' : 'medium',
        metadataJson: JSON.stringify({ snapshot, strike }),
      },
    });
    // Warn-only records and counts but never interrupts the candidate.
    const status = enforcement === 'warn' ? attempt.status : atLimit ? 'blocked' : 'paused';
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        webcamViolationCount: strike,
        status,
        pausedAt: enforcement === 'warn' ? null : new Date(),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return { attempt: updated, strike };
  }
```

- [ ] **Step 5: Rewrite the tail of registerBrowserActivityViolation**

Insert `exam: SettlementExam,` as the second parameter. Leave the 60-second cooldown lookup and the `if (!isFreshStrike || attempt.status === 'blocked')` early return untouched. Replace everything from `const strike = attempt.browserActivityViolationCount + 1;` to the closing brace with:

```ts
    const { enforcement, strikeLimit } = resolveProctoringConfig(exam);
    const strike = attempt.browserActivityViolationCount + 1;
    const status = enforcement === 'warn' ? attempt.status : strike >= strikeLimit ? 'blocked' : 'paused';
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        browserActivityViolationCount: strike,
        status,
        pausedAt: enforcement === 'warn' ? null : new Date(),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return { attempt: updated, strike, event };
  }
```

- [ ] **Step 6: Update the two call sites**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, in `reportProctoringEvent`:

```ts
        const { attempt: updated, strike, event } = await this.attemptSettlement.registerBrowserActivityViolation(
          tx,
          exam,
          attempt,
          dto.eventType,
          dto.metadata,
        );
```

In `webcamViolation`, change the destructure to include `exam`:

```ts
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);
```

and the call to:

```ts
      const { attempt: updated, strike } = await this.attemptSettlement.registerWebcamViolation(tx, exam, attempt, dto.reason, snapshotUrl);
```

- [ ] **Step 7: Fix the remaining call sites, then run both specs**

Run: `cd apps/exam-runtime && npx tsc --noEmit -p tsconfig.json`
Expected: compile errors naming every remaining two-arg call in the spec files. Update each pre-existing `registerWebcamViolation(tx, attempt, ...)` / `registerBrowserActivityViolation(tx, attempt, ...)` call to insert an exam object carrying `proctoringEnforcement: 'block'`, `proctoringStrikeLimit: 3`, `webcamProctoringEnabled: true`, `disabledProctoringSignalsJson: null`. Those tests were written against the old hardcoded 3, so this preserves their intent exactly.

Then run: `cd apps/exam-runtime && npx jest`
Expected: PASS, whole suite.

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: honour per-exam strike limit and warn-only enforcement"
```

---

### Task 7: Reset violation counters on recruiter unblock only

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts` — `resumeFromPause` at :305-315
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts` — the `unblock` handler's `resumeFromPause` call
- Test: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts` — `describe('resumeFromPause')` at :925+
- Test: `apps/exam-runtime/src/internal/internal.controller.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `resumeFromPause(tx, attempt, options?: { resetViolationCounters?: boolean })`. The candidate self-resume path in `attempt.service.ts` `webcamResume` keeps the two-argument call and must stay that way.

- [ ] **Step 1: Write the failing tests**

Add to `describe('resumeFromPause', ...)`:

```ts
    it('leaves the violation counters alone on a candidate self-resume, so strikes cannot be farmed', async () => {
      tx.attempt.update.mockResolvedValue({ id: 'a1', examId: 'exam-1', status: 'in_progress' });

      await service.resumeFromPause(tx, {
        id: 'a1', examId: 'exam-1', candidateId: 'c1', pausedAt: new Date(), pausedDurationMs: 0,
        webcamViolationCount: 2, browserActivityViolationCount: 1,
      } as never);

      const data = tx.attempt.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('webcamViolationCount');
      expect(data).not.toHaveProperty('browserActivityViolationCount');
    });

    it('zeroes both counters when a recruiter unblocks, so the candidate gets a real second chance', async () => {
      tx.attempt.update.mockResolvedValue({ id: 'a1', examId: 'exam-1', status: 'in_progress' });

      await service.resumeFromPause(
        tx,
        {
          id: 'a1', examId: 'exam-1', candidateId: 'c1', pausedAt: new Date(), pausedDurationMs: 0,
          webcamViolationCount: 3, browserActivityViolationCount: 3,
        } as never,
        { resetViolationCounters: true },
      );

      const data = tx.attempt.update.mock.calls[0][0].data;
      expect(data.webcamViolationCount).toBe(0);
      expect(data.browserActivityViolationCount).toBe(0);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest attempt-settlement -t "second chance"`
Expected: FAIL — counters are never written, so `data.webcamViolationCount` is `undefined`.

- [ ] **Step 3: Add the options parameter**

Replace `resumeFromPause` with:

```ts
  async resumeFromPause(
    tx: Prisma.TransactionClient,
    attempt: Attempt,
    options: { resetViolationCounters?: boolean } = {},
  ): Promise<Attempt> {
    const elapsedMs = attempt.pausedAt ? Date.now() - attempt.pausedAt.getTime() : 0;
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        status: 'in_progress',
        pausedAt: null,
        pausedDurationMs: attempt.pausedDurationMs + elapsedMs,
        // Only a recruiter unblock clears the slate. Doing this on the candidate's
        // own webcam self-resume would let them trip the same rule forever.
        ...(options.resetViolationCounters ? { webcamViolationCount: 0, browserActivityViolationCount: 0 } : {}),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return updated;
  }
```

- [ ] **Step 4: Opt the recruiter unblock path in**

In `apps/exam-runtime/src/internal/internal.controller.ts`, in the `unblock` handler, change:

```ts
      return this.attemptSettlement.resumeFromPause(tx, attempt);
```

to:

```ts
      return this.attemptSettlement.resumeFromPause(tx, attempt, { resetViolationCounters: true });
```

Leave `attempt.service.ts`'s `webcamResume` call unchanged — the two-argument form is now the explicit "do not reset" path.

- [ ] **Step 5: Add the controller-level test**

Add to the unblock describe block in `apps/exam-runtime/src/internal/internal.controller.spec.ts`, matching how that file already invokes the controller and mocks `attemptSettlement`:

```ts
    it('asks for the violation counters to be reset, so the next event does not immediately re-block', async () => {
      await controller.unblock('a1');

      expect(attemptSettlement.resumeFromPause).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ id: 'a1' }),
        { resetViolationCounters: true },
      );
    });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest`
Expected: PASS, whole suite.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts apps/exam-runtime/src/internal/internal.controller.ts apps/exam-runtime/src/internal/internal.controller.spec.ts
git commit -m "fix: reset violation counters when a recruiter unblocks an attempt"
```

---

### Task 8: Teach the candidate monitor hooks to respect the config

**Files:**
- Modify: `apps/web/lib/types.ts` — `AttemptPreview` :303-317, `AttemptState` :333-346
- Modify: `apps/web/lib/hooks/useProctoringMonitor.ts`
- Modify: `apps/web/lib/hooks/useWebcamMonitor.ts`
- Test: `apps/web/lib/hooks/useProctoringMonitor.test.tsx`
- Test: `apps/web/lib/hooks/useWebcamMonitor.test.tsx`

**Interfaces:**
- Consumes: the wire shape produced by Task 4.
- Produces: `export interface ExamProctoringConfig` in `apps/web/lib/types.ts`; `useProctoringMonitor(enabled: boolean, onViolation?: (eventType: ProctoringEventType) => void, config?: ExamProctoringConfig)`; `useWebcamMonitor(enabled: boolean, onViolationReason?: (reason: string) => void, config?: ExamProctoringConfig)`. Both treat an omitted `config` as "watch everything" so every existing call site keeps working unchanged.

- [ ] **Step 1: Mirror the type and add it to both payload shapes**

In `apps/web/lib/types.ts`, add above `AttemptPreview`:

```ts
export interface ExamProctoringConfig {
  webcamEnabled: boolean;
  enforcement: 'warn' | 'block';
  strikeLimit: number;
  disabledSignals: string[];
}
```

In `AttemptPreview.exam`, add after `availabilityWindowEnd: string | null;`:

```ts
    proctoring: ExamProctoringConfig;
```

Change `AttemptState`'s exam line from `exam: { title: string };` to:

```ts
  exam: { title: string; proctoring: ExamProctoringConfig };
```

- [ ] **Step 2: Write the failing tests for useProctoringMonitor**

Add to `apps/web/lib/hooks/useProctoringMonitor.test.tsx`. The file's existing `Probe` takes only `enabled`; add a second probe rather than changing it:

```tsx
  describe('per-exam signal config', () => {
    function ConfigProbe({ enabled, config }: { enabled: boolean; config?: any }) {
      useProctoringMonitor(enabled, undefined, config);
      return null;
    }

    it('does not report a signal the exam has disabled', () => {
      render(<ConfigProbe enabled={true} config={{ webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: ['right_click'] }} />);

      document.dispatchEvent(new Event('contextmenu'));

      expect(report).not.toHaveBeenCalledWith('right_click');
    });

    it('still reports signals that are not disabled', () => {
      render(<ConfigProbe enabled={true} config={{ webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: ['right_click'] }} />);
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });

      document.dispatchEvent(new Event('visibilitychange'));

      expect(report).toHaveBeenCalledWith('tab_switch', undefined);
    });

    it('watches everything when no config is supplied, preserving the pre-config behaviour', () => {
      render(<ConfigProbe enabled={true} />);

      document.dispatchEvent(new Event('contextmenu'));

      expect(report).toHaveBeenCalledWith('right_click');
    });

    it('picks up a config change without tearing down and re-arming the listeners', () => {
      const { rerender } = render(
        <ConfigProbe enabled={true} config={{ webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] }} />,
      );
      document.dispatchEvent(new Event('contextmenu'));
      expect(report).toHaveBeenCalledWith('right_click');
      report.mockClear();

      // A fresh object identity each render is exactly what React Query hands us.
      rerender(
        <ConfigProbe enabled={true} config={{ webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: ['right_click'] }} />,
      );
      document.dispatchEvent(new Event('contextmenu'));

      expect(report).not.toHaveBeenCalledWith('right_click');
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npx jest useProctoringMonitor -t "per-exam signal config"`
Expected: FAIL — the disabled signal is still reported, because the third argument is ignored.

- [ ] **Step 4: Implement the config gate in useProctoringMonitor**

Change the signature and add a ref mirror. Replace the opening of the hook:

```ts
export function useProctoringMonitor(
  enabled: boolean,
  onViolation?: (eventType: ProctoringEventType) => void,
  config?: ExamProctoringConfig,
): void {
  const report = useReportProctoringEvent();
  const reportRef = useRef(report);
  reportRef.current = report;
  const onViolationRef = useRef(onViolation);
  onViolationRef.current = onViolation;
  // Mirrored through a ref, not the effect's dep array: React Query hands us a new
  // object identity on every refetch (every 3-30s), and widening the deps would
  // tear down and re-arm every listener on that cadence.
  const configRef = useRef(config);
  configRef.current = config;
```

Add the import for the type:

```ts
import { ProctoringEventType, ExamProctoringConfig } from '../types';
```

Then, inside the effect, add this helper immediately above `reportAndNotify`:

```ts
    function isSignalEnabled(eventType: ProctoringEventType): boolean {
      const disabled = configRef.current?.disabledSignals;
      return !disabled || !disabled.includes(eventType);
    }
```

Guard both report paths. In `reportAndNotify`, make the first line:

```ts
      if (!isSignalEnabled(eventType)) return;
```

In `debouncedReport`, make the first line:

```ts
      if (!isSignalEnabled(eventType)) return;
```

Leave the `useEffect` dependency array as `[enabled]`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx jest useProctoringMonitor`
Expected: PASS, including all pre-existing tests (they pass no config, so nothing is gated).

- [ ] **Step 6: Write the failing test for useWebcamMonitor**

Add to `apps/web/lib/hooks/useWebcamMonitor.test.tsx`:

```tsx
  it('never touches the camera when the exam has webcam proctoring turned off', async () => {
    function ConfigProbe() {
      useWebcamMonitor(true, undefined, { webcamEnabled: false, enforcement: 'block', strikeLimit: 3, disabledSignals: [] });
      return null;
    }

    render(<ConfigProbe />);
    await act(async () => {
      await Promise.resolve();
    });

    // Must short-circuit before setup(): the hook's fail-safe reports a real
    // no_face violation on camera failure, so relying on getUserMedia failing
    // would generate violations for an exam that opted out of webcam entirely.
    expect(getUserMediaMock).not.toHaveBeenCalled();
    expect(reportViolation).not.toHaveBeenCalled();
  });
```

Match the file's existing mock names for `getUserMedia` and the violation reporter — read the top of the file and reuse them.

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd apps/web && npx jest useWebcamMonitor -t "webcam proctoring turned off"`
Expected: FAIL — `getUserMedia` is called because the third argument is ignored.

- [ ] **Step 8: Implement the webcam short-circuit**

In `apps/web/lib/hooks/useWebcamMonitor.ts`, change the signature to:

```ts
export function useWebcamMonitor(
  enabled: boolean,
  onViolationReason?: (reason: string) => void,
  config?: ExamProctoringConfig,
): void {
```

Import the type from `../types` alongside whatever it already imports. Add a ref mirror next to the existing callback refs:

```ts
  const configRef = useRef(config);
  configRef.current = config;
```

Then, inside the effect, change the existing bail-out line `if (!enabled) return;` to:

```ts
    // webcamEnabled === false must bail before setup() -- see the fail-safe below,
    // which reports a real no_face violation if the camera cannot be acquired.
    if (!enabled || configRef.current?.webcamEnabled === false) return;
```

Leave the dev escape hatch and the dependency array untouched.

- [ ] **Step 9: Run both hook specs to verify they pass**

Run: `cd apps/web && npx jest useWebcamMonitor useProctoringMonitor`
Expected: PASS, including the pre-existing production-escape-hatch test.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useProctoringMonitor.ts apps/web/lib/hooks/useProctoringMonitor.test.tsx apps/web/lib/hooks/useWebcamMonitor.ts apps/web/lib/hooks/useWebcamMonitor.test.tsx
git commit -m "feat: gate candidate proctoring monitors on per-exam config"
```

---

### Task 9: Wire the config through the candidate pages and overlay

**Files:**
- Modify: `apps/web/app/(candidate)/exam/page.tsx` — monitor calls at :82-91, overlay render
- Modify: `apps/web/app/(candidate)/components/ProctoringOverlay.tsx` — `ProctoringWarningOverlay` (hardcoded `Warning {strike}/3` at :45)
- Modify: `apps/web/app/(candidate)/welcome/page.tsx` — multi-monitor start gate at :59-74, camera permission prompt at :48-57/:132-140
- Test: `apps/web/app/(candidate)/exam/page.test.tsx`
- Test: `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx`
- Test: `apps/web/app/(candidate)/welcome/page.test.tsx`

**Interfaces:**
- Consumes: `ExamProctoringConfig` and the widened hook signatures from Task 8; `AttemptState.exam.proctoring` / `AttemptPreview.exam.proctoring` from Task 4.
- Produces: `ProctoringWarningOverlay` gains a required `strikeLimit: number` prop.

- [ ] **Step 1: Write the failing overlay test**

Add to `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx`:

```tsx
  it('shows the strike count against the exam configured limit rather than a hardcoded 3', () => {
    render(
      <ProctoringWarningOverlay strike={1} strikeLimit={2} reason="tab_switch" onContinue={() => {}} continuePending={false} continueError={false} />,
    );

    expect(screen.getByText('Warning 1/2')).toBeInTheDocument();
  });
```

Update any pre-existing test in this file that asserts `Warning 1/3` to pass `strikeLimit={3}` explicitly, keeping its expectation unchanged.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest ProctoringOverlay`
Expected: FAIL — renders `Warning 1/3`.

- [ ] **Step 3: Add the prop to the overlay**

In `apps/web/app/(candidate)/components/ProctoringOverlay.tsx`, add `strikeLimit: number;` to `ProctoringWarningOverlayProps`, destructure it, and change line 45 to:

```tsx
        <p className="mb-4 text-xs text-candidate-text-faint">Warning {strike}/{strikeLimit}</p>
```

- [ ] **Step 4: Run the overlay test to verify it passes**

Run: `cd apps/web && npx jest ProctoringOverlay`
Expected: PASS.

- [ ] **Step 5: Write the failing exam-page tests**

Add to `apps/web/app/(candidate)/exam/page.test.tsx`. The file already mocks both monitor hooks — these assert the third argument now reaches them.

```tsx
  describe('per-exam proctoring config', () => {
    it('passes the exam proctoring config through to both monitors', async () => {
      const proctoring = { webcamEnabled: false, enforcement: 'warn' as const, strikeLimit: 2, disabledSignals: ['right_click'] };
      renderExamPage({ ...attemptState, exam: { title: 'Screen', proctoring } });

      await waitFor(() => expect(useProctoringMonitor).toHaveBeenCalled());
      expect(useProctoringMonitor).toHaveBeenLastCalledWith(true, expect.any(Function), proctoring);
      expect(useWebcamMonitor).toHaveBeenLastCalledWith(true, expect.any(Function), proctoring);
    });
  });
```

Use whatever render helper and fixture names this spec already defines — `renderExamPage` and `attemptState` above stand in for them. Every existing `AttemptState` fixture in this file must also gain `proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] }` inside its `exam` object.

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd apps/web && npx jest "candidate/exam/page" -t "per-exam proctoring config"`
Expected: FAIL — the hooks are called with two arguments.

- [ ] **Step 7: Wire the page**

In `apps/web/app/(candidate)/exam/page.tsx`, add below the `started` line:

```tsx
  const proctoringConfig = attemptState?.exam.proctoring;
```

Pass it as the third argument to both hooks:

```tsx
  useProctoringMonitor(
    started,
    (eventType) => {
      hasLiveViolationSource.current = true;
      setLastViolationReason(eventType);
      setLastViolationSource('browser_activity');
    },
    proctoringConfig,
  );
  useWebcamMonitor(
    started,
    (reason) => {
      hasLiveViolationSource.current = true;
      setLastViolationReason(reason);
      setLastViolationSource('webcam');
    },
    proctoringConfig,
  );
```

Find where `ProctoringWarningOverlay` is rendered and add the limit, defaulting to 3 so a payload from an older server still renders sensibly:

```tsx
          strikeLimit={proctoringConfig?.strikeLimit ?? 3}
```

- [ ] **Step 8: Run the exam page spec to verify it passes**

Run: `cd apps/web && npx jest "candidate/exam/page"`
Expected: PASS, including the existing `describe('browser-activity strikes')` block.

- [ ] **Step 9: Write the failing welcome-page tests**

Add to `apps/web/app/(candidate)/welcome/page.test.tsx`:

```tsx
  it('does not block starting on a second display when the exam has that signal turned off', async () => {
    Object.defineProperty(window.screen, 'isExtended', { value: true, configurable: true });
    renderWelcome({
      ...preview,
      exam: {
        ...preview.exam,
        proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: ['multi_monitor_detected'] },
      },
    });

    await userEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(screen.queryByText(/additional display/i)).not.toBeInTheDocument();
  });

  it('still blocks starting on a second display when the signal is watched', async () => {
    Object.defineProperty(window.screen, 'isExtended', { value: true, configurable: true });
    renderWelcome({
      ...preview,
      exam: { ...preview.exam, proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] } },
    });

    await userEvent.click(screen.getByRole('button', { name: /start/i }));

    expect(screen.getByText(/additional display/i)).toBeInTheDocument();
  });
```

Match the file's own render helper and preview fixture names, and add `proctoring: { webcamEnabled: true, enforcement: 'block', strikeLimit: 3, disabledSignals: [] }` to every existing `AttemptPreview` fixture's `exam` object.

- [ ] **Step 10: Run the tests to verify they fail**

Run: `cd apps/web && npx jest "candidate/welcome" -t "second display"`
Expected: FAIL — the gate fires regardless of config.

- [ ] **Step 11: Gate the welcome-page checks**

In `apps/web/app/(candidate)/welcome/page.tsx`, read the config once:

```tsx
  const proctoring = preview?.exam.proctoring;
```

In `handleStart`, wrap the multi-monitor gate so it only runs when that signal is watched:

```tsx
    const watchesMultiMonitor = !proctoring?.disabledSignals.includes('multi_monitor_detected');
    if (watchesMultiMonitor && (window.screen as Screen & { isExtended?: boolean }).isExtended === true) {
      setMultiMonitorBlocked(true);
      return;
    }
```

Skip the camera permission request when webcam proctoring is off for this exam — guard the existing `getUserMedia` call and the consent copy that mentions the camera with `proctoring?.webcamEnabled !== false`.

- [ ] **Step 12: Run the whole candidate suite**

Run: `cd apps/web && npx jest "(candidate)"`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add "apps/web/app/(candidate)"
git commit -m "feat: apply per-exam proctoring config in the candidate runtime"
```

---

### Task 10: Recruiter UI for the proctoring settings

**Files:**
- Modify: `apps/web/components/ExamDetailsForm.tsx`
- Modify: `apps/web/lib/types.ts` — add the four fields to `Exam`
- Test: `apps/web/components/ExamDetailsForm.test.tsx`

**Interfaces:**
- Consumes: `TOGGLEABLE_PROCTORING_SIGNALS` semantics from Task 2 (redeclare the labelled list locally — `apps/web` does not import from `apps/api`).
- Produces: `ExamDetailsValue` gains `webcamProctoringEnabled: boolean`, `proctoringEnforcement: 'warn' | 'block'`, `proctoringStrikeLimit: number`, `disabledProctoringSignals: string[]`. `ExamDetailsFormProps` gains `locked?: boolean`.

- [ ] **Step 1: Add the fields to the client Exam type**

In `apps/web/lib/types.ts`, add to `interface Exam` after `allowedIpRange`:

```ts
  webcamProctoringEnabled: boolean;
  proctoringEnforcement: 'warn' | 'block';
  proctoringStrikeLimit: number;
  disabledProctoringSignalsJson: string | null;
```

- [ ] **Step 2: Write the failing tests**

Add to `apps/web/components/ExamDetailsForm.test.tsx`:

```tsx
  describe('proctoring settings', () => {
    it("submits today's defaults when the recruiter changes nothing", async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          webcamProctoringEnabled: true,
          proctoringEnforcement: 'block',
          proctoringStrikeLimit: 3,
          disabledProctoringSignals: [],
        }),
      );
    });

    it('submits webcam off and the signals the recruiter unticked', async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByLabelText('Require webcam proctoring'));
      await userEvent.click(screen.getByRole('button', { name: /which activity to watch/i }));
      await userEvent.click(screen.getByLabelText('Right-click / context menu'));
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ webcamProctoringEnabled: false, disabledProctoringSignals: ['right_click'] }),
      );
    });

    it('hides the strike limit in record-only mode, because nothing is ever blocked', async () => {
      render(<ExamDetailsForm tags={[]} onSubmit={jest.fn()} submitLabel="Create" />);

      expect(screen.getByLabelText('Block after')).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText(/Record only/i));

      expect(screen.queryByLabelText('Block after')).not.toBeInTheDocument();
    });

    it('prefills from an existing exam, reading the stored disabled-signal JSON', () => {
      render(
        <ExamDetailsForm
          tags={[]}
          onSubmit={jest.fn()}
          submitLabel="Save"
          initialExam={
            {
              title: 'Screen',
              durationMinutes: 60,
              passCriteriaPercent: 40,
              randomizeOrder: false,
              feedbackVisibility: 'pass_fail',
              schedulingEnabled: false,
              walkInEnabled: false,
              webcamProctoringEnabled: false,
              proctoringEnforcement: 'warn',
              proctoringStrikeLimit: 5,
              disabledProctoringSignalsJson: JSON.stringify(['right_click']),
            } as never
          }
        />,
      );

      expect(screen.getByLabelText('Require webcam proctoring')).not.toBeChecked();
      expect(screen.getByLabelText(/Record only/i)).toBeChecked();
    });

    it('disables every proctoring control once the exam is locked, and says why', () => {
      render(<ExamDetailsForm tags={[]} onSubmit={jest.fn()} submitLabel="Save" locked />);

      expect(screen.getByLabelText('Require webcam proctoring')).toBeDisabled();
      expect(screen.getByText(/locked because candidates have already been invited/i)).toBeInTheDocument();
    });
  });
```

Match the props this spec already passes to `ExamDetailsForm` — if it does not take a `tags` prop, drop it from these calls.

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npx jest ExamDetailsForm -t "proctoring settings"`
Expected: FAIL — none of these controls exist.

- [ ] **Step 4: Extend ExamDetailsValue and the props**

In `apps/web/components/ExamDetailsForm.tsx`, add to `ExamDetailsValue`:

```ts
  webcamProctoringEnabled: boolean;
  proctoringEnforcement: 'warn' | 'block';
  proctoringStrikeLimit: number;
  disabledProctoringSignals: string[];
```

Add `locked?: boolean;` to `ExamDetailsFormProps` and destructure it with a `= false` default.

Add the labelled signal list above the component:

```ts
// Recruiters will not recognise the raw event-type names, so every toggle carries
// plain-language copy. Keys must stay in sync with TOGGLEABLE_PROCTORING_SIGNALS
// in apps/api/src/exams/dto/create-exam.dto.ts.
const PROCTORING_SIGNAL_LABELS: { value: string; label: string }[] = [
  { value: 'tab_switch', label: 'Switching browser tabs' },
  { value: 'window_blur', label: 'Switching to another application' },
  { value: 'fullscreen_exit', label: 'Leaving fullscreen' },
  { value: 'copy_paste', label: 'Copy / paste' },
  { value: 'right_click', label: 'Right-click / context menu' },
  { value: 'dev_tools_detected', label: 'Developer tools' },
  { value: 'multi_monitor_detected', label: 'A second display' },
  { value: 'idle_timeout', label: 'Long inactivity' },
];
```

- [ ] **Step 5: Add the state**

Inside the component, alongside the other `useState` calls:

```ts
  const [webcamProctoringEnabled, setWebcamProctoringEnabled] = useState(initialExam?.webcamProctoringEnabled ?? true);
  const [proctoringEnforcement, setProctoringEnforcement] = useState<'warn' | 'block'>(initialExam?.proctoringEnforcement ?? 'block');
  const [proctoringStrikeLimit, setProctoringStrikeLimit] = useState(String(initialExam?.proctoringStrikeLimit ?? 3));
  const [disabledSignals, setDisabledSignals] = useState<string[]>(() => {
    if (!initialExam?.disabledProctoringSignalsJson) return [];
    try {
      const parsed = JSON.parse(initialExam.disabledProctoringSignalsJson);
      return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
    } catch {
      return [];
    }
  });
  const [signalsOpen, setSignalsOpen] = useState(false);
```

- [ ] **Step 6: Include the fields in the submitted value**

Add to the `onSubmit({ ... })` call:

```ts
      webcamProctoringEnabled,
      proctoringEnforcement,
      proctoringStrikeLimit: Number(proctoringStrikeLimit),
      disabledProctoringSignals: disabledSignals,
```

- [ ] **Step 7: Render the section**

Insert this block immediately before the submit `<Button>`:

```tsx
      <fieldset disabled={locked} className="flex flex-col gap-3 rounded-md border border-recruiter-border p-3">
        <legend className="px-1 text-sm font-semibold text-recruiter-text">Proctoring &amp; integrity</legend>
        {locked && (
          <p className="text-xs text-recruiter-text-secondary">
            These settings are locked because candidates have already been invited to this published exam — changing the rules
            mid-exam would judge candidates in the same exam differently.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={webcamProctoringEnabled}
            onChange={(e) => setWebcamProctoringEnabled(e.target.checked)}
          />
          Require webcam proctoring
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-gray-700">If a rule is broken</span>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="proctoring-enforcement"
              checked={proctoringEnforcement === 'block'}
              onChange={() => setProctoringEnforcement('block')}
            />
            Pause the exam, then block after repeated strikes
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name="proctoring-enforcement"
              checked={proctoringEnforcement === 'warn'}
              onChange={() => setProctoringEnforcement('warn')}
            />
            Record only — never pause the exam
          </label>
        </div>
        {proctoringEnforcement === 'block' && (
          <Select
            label="Block after"
            value={proctoringStrikeLimit}
            onChange={setProctoringStrikeLimit}
            options={[
              { value: '2', label: '2 strikes' },
              { value: '3', label: '3 strikes' },
              { value: '5', label: '5 strikes' },
            ]}
          />
        )}
        <button
          type="button"
          onClick={() => setSignalsOpen((open) => !open)}
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          {signalsOpen ? 'Hide' : 'Choose'} which activity to watch ({PROCTORING_SIGNAL_LABELS.length - disabledSignals.length}/
          {PROCTORING_SIGNAL_LABELS.length})
        </button>
        {signalsOpen && (
          <div className="flex flex-col gap-1.5 pl-1">
            {PROCTORING_SIGNAL_LABELS.map((signal) => (
              <label key={signal.value} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={!disabledSignals.includes(signal.value)}
                  onChange={(e) =>
                    setDisabledSignals((current) =>
                      e.target.checked ? current.filter((entry) => entry !== signal.value) : [...current, signal.value],
                    )
                  }
                />
                {signal.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>
```

- [ ] **Step 8: Pass locked from the edit page**

In `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`, find where `ExamDetailsForm` is rendered and add:

```tsx
        locked={exam.status === 'published' && exam.invitationCount > 0}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/web && npx jest ExamDetailsForm`
Expected: PASS. The existing tests in this file will now receive four extra keys in the submitted object — if any asserts with a strict `toEqual`, extend it with the four defaults rather than switching to `objectContaining`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/ExamDetailsForm.tsx apps/web/components/ExamDetailsForm.test.tsx apps/web/lib/types.ts "apps/web/app/(recruiter)/exams/[id]/edit/page.tsx"
git commit -m "feat: add per-exam proctoring settings to the exam form"
```

---

### Task 11: Full verification and production deployment

**Files:** none modified — this task verifies and ships Tasks 1-10.

**Interfaces:**
- Consumes: everything above.
- Produces: the feature live on `https://prudenthire.prudentconsulting.com`.

- [ ] **Step 1: Run every suite**

```bash
cd apps/api && npx jest --maxWorkers=2
cd ../exam-runtime && npx jest --maxWorkers=2
cd ../web && npx jest --maxWorkers=2
```

Expected: all three suites green. `--maxWorkers=2` avoids the load-induced timeout flakes this machine produces at full parallelism.

- [ ] **Step 2: Type-check all three apps**

```bash
cd apps/api && npx tsc --noEmit -p tsconfig.json
cd ../exam-runtime && npx tsc --noEmit -p tsconfig.json
cd ../web && npx tsc --noEmit -p tsconfig.json
```

Expected: no output beyond the pre-existing errors in `apps/web`'s `*.test.tsx` files. Any error naming a non-test file is a real regression — fix before continuing.

- [ ] **Step 3: Confirm no live exam is in progress before touching exam-runtime**

Restarting `exam-runtime` drops live exam websocket sessions, so check first:

```bash
Write the probe to a file on the VM first — inlining SQL string literals through nested
shell and JS quoting is how these one-liners get mangled:

```bash
ssh -i <key> ptcsfadmin@20.219.132.226 'cat > ~/check-live-attempts.js' <<'JS'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  await prisma.$executeRawUnsafe("EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 1");
  await prisma.$executeRawUnsafe("EXEC sp_set_session_context @key = N'app_current_org', @value = NULL");
  const rows = await prisma.$queryRawUnsafe(
    "SELECT status, COUNT(*) AS n FROM attempts WHERE status IN ('in_progress','paused') GROUP BY status",
  );
  console.log('LIVE ATTEMPTS:', JSON.stringify(rows));
  await prisma.$disconnect();
})().catch((error) => { console.error(error.message); process.exit(1); });
JS
```

Then run it with the same `DATABASE_URL` extraction used for the migration:

```bash
ssh -i <key> ptcsfadmin@20.219.132.226 'cd ~/app && DB_URL=$(grep "^DATABASE_URL=" apps/api/.env | head -1 | cut -d= -f2- | sed -e "s/^\"//" -e "s/\"$//") && DATABASE_URL="$DB_URL" node ~/check-live-attempts.js'
```
```

Expected: an empty array. If any `in_progress` or `paused` attempt exists, stop and ask the user before proceeding — a restart would interrupt a real candidate.

- [ ] **Step 4: Copy the migration and schema, then apply it**

`mkdir -p` the migration directory on the VM first, then scp `migration.sql` and `apps/api/prisma/schema.prisma` (one scp call per file, each with its full destination path). Verify with `grep`, then:

```bash
ssh -i <key> ptcsfadmin@20.219.132.226 'cd ~/app && DB_URL=$(grep "^DATABASE_URL=" apps/api/.env | head -1 | cut -d= -f2- | sed -e "s/^\"//" -e "s/\"$//") && DATABASE_URL="$DB_URL" npx prisma migrate status --schema=apps/api/prisma/schema.prisma'
```

Expected: exactly one pending migration, `20260725120000_exam_proctoring_config`. Then run the same command with `migrate deploy` instead of `migrate status`.

- [ ] **Step 5: Verify the columns and their defaults on real rows**

Run a raw query on the VM:

```sql
SELECT proctoring_enforcement, proctoring_strike_limit, webcam_proctoring_enabled, COUNT(*) n FROM exams GROUP BY proctoring_enforcement, proctoring_strike_limit, webcam_proctoring_enabled
```

Expected: a single row — `block`, `3`, `1`, with `n` equal to the total exam count. Anything else means existing exams did not inherit today's behaviour; stop and investigate.

- [ ] **Step 6: Copy the application files**

One scp call per file, each verified with `grep` immediately after — a silent mid-batch SSH drop is a known failure mode on this VM:

`apps/api/src/exams/dto/create-exam.dto.ts`, `apps/api/src/exams/exams.service.ts`, `apps/exam-runtime/src/attempts/proctoring-config.ts`, `apps/exam-runtime/src/attempts/attempt.service.ts`, `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, `apps/exam-runtime/src/internal/internal.controller.ts`, `apps/web/lib/types.ts`, `apps/web/lib/hooks/useProctoringMonitor.ts`, `apps/web/lib/hooks/useWebcamMonitor.ts`, `apps/web/components/ExamDetailsForm.tsx`, `apps/web/app/(candidate)/exam/page.tsx`, `apps/web/app/(candidate)/welcome/page.tsx`, `apps/web/app/(candidate)/components/ProctoringOverlay.tsx`, `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`.

- [ ] **Step 7: Regenerate the client and rebuild all three apps**

Launch detached so an SSH drop cannot kill it:

```bash
cd ~/app && rm -f ~/build-all.log ~/build-all.done && nohup bash -c 'npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime && npm run build --workspace=apps/web && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static && cp -r apps/web/public apps/web/.next/standalone/apps/web/public && echo OK > ~/build-all.done || echo FAIL > ~/build-all.done' > ~/build-all.log 2>&1 < /dev/null & disown
```

Wait for `~/build-all.done` to read `OK`. On `FAIL`, tail `~/build-all.log` and report the real error — do not restart anything.

- [ ] **Step 8: Restart all three processes**

```bash
pm2 restart api exam-runtime web
```

This is the one deploy in this sequence that must restart `exam-runtime`, which is why Step 3 checked for live attempts.

- [ ] **Step 9: Smoke test**

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://prudenthire.prudentconsulting.com/
curl -s -o /dev/null -w "%{http_code}\n" https://prudenthire.prudentconsulting.com/login
curl -s -o /dev/null -w "%{http_code}\n" https://prudenthire.prudentconsulting.com/exams
```

Expected: `200` three times. Then confirm `pm2 status` shows all three processes online with restart counts incremented by exactly one and no crash-loop, and that `~/.pm2/logs/*-error.log` have no writes after the restart timestamp.

- [ ] **Step 10: Verify the new config reaches the API**

Generate a short-lived recruiter JWT on the VM (the `jwt.sign` recipe used earlier in this project), then:

```bash
curl -s "https://prudenthire.prudentconsulting.com/api/v1/exams?pageSize=1" -H "Authorization: Bearer <token>"
```

Expected: each exam row carries `"proctoringEnforcement":"block"`, `"proctoringStrikeLimit":3`, `"webcamProctoringEnabled":true`. This proves the migration and the new mapping are live end to end, not merely deployed.

- [ ] **Step 11: Record the deployment note**

Append to the deployment memory at `C:\Users\HariSivaSaiKumarMada\.claude\projects\D--exam-app\memory\project_azure_deployment.md` that this deploy required restarting `exam-runtime` (unlike additive-column deploys), and that Step 3's in-progress-attempt check is the gate for doing so safely.
