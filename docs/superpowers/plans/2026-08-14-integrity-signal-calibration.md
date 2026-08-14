# Integrity Signal Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `high_concern` mean something, by stopping ambiguous webcam events from driving the integrity verdict on 75% of attempts.

**Architecture:** Two layers of classification inside one pure module. `CONTEXT_EVENT_TYPES` stops ambiguous *event types* from raising the `proctoring_events` flag to high; `FLAG_EVIDENCE_CLASS` stops context-class *flags* from driving the level at all. A one-off sequential backfill then recomputes the 265 existing analyses through the real `analyze()` code path so history and new attempts share one standard.

**Tech Stack:** NestJS 11, TypeScript, Jest, Prisma, Azure SQL.

**Spec:** `docs/superpowers/specs/2026-08-14-integrity-signal-calibration-design.md`

## Global Constraints

- **Read-only with respect to the candidate exam path.** Nothing changes how events are recorded, or webcam detection sensitivity, during a live exam.
- **Event severity stays as it is.** `webcam_no_face` may legitimately be high-priority to a live invigilator; that is a different question from whether it is evidence of cheating afterwards. Do NOT change severities where events are created.
- No new dependency, no schema change, no migration.
- Existing thresholds are unchanged: `LARGE_PASTE_CHARS` 200, `LARGE_PASTE_HIGH_CHARS` 800, `PASTE_DOMINANT_MIN_CHARS` 300, `MEDIUM_EVENT_COUNT_FLAG` 5.
- `implausible_speed` is **deleted**, not tuned.
- The backfill must be **sequential and idempotent**, and must not destroy existing narratives.

## Key context for every implementer

**This change is supposed to move roughly 200 verdicts.** "The suite still passes" therefore proves nothing on its own. Tests that assert the old behaviour encode the bug and are to be deleted with a comment, never quietly edited until green.

**`analyze()` already runs as super-admin** for its attempt lookup — `forTenant({ organizationId: null, isSuperAdmin: true })` at `integrity-analysis.service.ts:33` — so it resolves any attempt regardless of organisation. The backfill needs no tenant loop and must not add one.

**One correction to the spec.** The spec says the backfill is "a loop rather than new logic" because `analyze()` recomputes from source. That is true of the *flags* but not of the *narrative*: `analyze()` writes `narrative` on every run, and on failure writes `null` (`integrity-analysis.service.ts:147`). Production has no AI key configured, so `aiApiKeyResolver.resolve()` throws and a naive backfill would blank the recruiter-facing explanation on every flagged attempt. Task 3 exists to close that hole and is not optional.

**The VM's SSH drops for minutes at a time** under disk load. Anything run against production goes in one connection, detached where it takes more than a few seconds.

## File Structure

**Modify:**
- `apps/exam-runtime/src/integrity/integrity-rules.ts` — both classification layers, delete `implausible_speed`. Stays pure: no NestJS, no DB, no imports.
- `apps/exam-runtime/src/integrity/integrity-rules.spec.ts` — add table tests, delete the test that pins the old level rule.
- `apps/exam-runtime/src/integrity/integrity-analysis.service.ts` — `analyze()` gains an options argument so the backfill can recompute without re-running the AI.
- `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts` — cover the new option.

**Create:**
- `scripts/recompute-integrity.ts` — the backfill.

**Not modified:** `attempt-settlement.service.ts`. Its two `analyze()` call sites (lines 258 and 418) keep their existing one-argument form and their existing behaviour.

---

### Task 1: Production dry-run — the gate

**Files:** none committed. This task writes no application code.

**Interfaces:**
- Consumes: nothing.
- Produces: a measured transition matrix, and a go/no-go decision.

**This task is a gate.** Every rate in the spec is arithmetic over flag counts, not a measurement. If the new rules do not land near **30–35% `high_concern`**, the design is wrong and the remaining tasks must not proceed until it is revised. Report the number even if it is inconvenient.

- [ ] **Step 1: Write the dry-run script locally**

Create `scripts/dry-run-integrity.js` (JavaScript, not TypeScript — it runs directly under node on the VM):

```javascript
const fs = require('fs'), path = require('path');
const raw = fs.readFileSync(path.join(process.env.HOME, 'app/apps/exam-runtime/.env'), 'utf8');
const line = raw.split(/\r?\n/).find((l) => l.startsWith('DATABASE_URL='));
process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).replace(/^"/, '').replace(/"$/, '');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

// Must match CONTEXT_EVENT_TYPES in integrity-rules.ts exactly.
const CONTEXT_EVENTS = new Set(['webcam_head_turned', 'webcam_no_face', 'multi_login']);
// Must match FLAG_EVIDENCE_CLASS: every class except 'context'.
const HEADLINE_FLAGS = new Set(['large_paste', 'paste_dominant', 'similarity_match', 'no_iteration', 'proctoring_events']);

(async () => {
  const analyses = await p.$queryRawUnsafe(
    "SELECT attempt_id, level, flags_json FROM integrity_analyses WHERE flags_json IS NOT NULL");
  const events = await p.$queryRawUnsafe(
    "SELECT attempt_id, event_type, severity FROM proctoring_events");

  const byAttempt = new Map();
  for (const e of events) {
    if (!byAttempt.has(e.attempt_id)) byAttempt.set(e.attempt_id, []);
    byAttempt.get(e.attempt_id).push(e);
  }

  const matrix = {};
  let newHigh = 0;
  for (const a of analyses) {
    let flags = [];
    try { flags = JSON.parse(a.flags_json) || []; } catch { continue; }
    const attemptEvents = byAttempt.get(a.attempt_id) || [];

    // Layer 1: proctoring_events severity from NON-CONTEXT high events only.
    const hardHigh = attemptEvents.filter((e) => e.severity === 'high' && !CONTEXT_EVENTS.has(e.event_type));
    const mediumCount = attemptEvents.filter((e) => e.severity === 'medium').length;

    const recomputed = [];
    for (const f of flags) {
      if (f.type === 'implausible_speed') continue;          // deleted
      if (f.type === 'proctoring_events') {
        if (hardHigh.length > 0) recomputed.push({ type: f.type, severity: 'high' });
        else if (mediumCount >= 5) recomputed.push({ type: f.type, severity: 'medium' });
        continue;                                            // context-only -> flag drops entirely
      }
      recomputed.push({ type: f.type, severity: f.severity });
    }

    // Layer 2: only headline classes may promote.
    const headline = recomputed.filter((f) => HEADLINE_FLAGS.has(f.type));
    let level;
    if (headline.some((f) => f.severity === 'high')) level = 'high_concern';
    else if (recomputed.length > 0) level = 'review';
    else level = 'clear';

    if (level === 'high_concern') newHigh += 1;
    const key = `${a.level} -> ${level}`;
    matrix[key] = (matrix[key] || 0) + 1;
  }

  console.log('TOTAL ' + analyses.length);
  console.log('NEW_HIGH_CONCERN ' + newHigh + ' (' + Math.round((newHigh / analyses.length) * 100) + '%)');
  console.log('TRANSITIONS ' + JSON.stringify(matrix));
  await p.$disconnect();
})().catch((e) => { console.log('ERR ' + String(e.message).slice(0, 250)); process.exit(0); });
```

Nothing here writes: it is `$queryRawUnsafe` SELECTs only.

- [ ] **Step 2: Run it against production, in one connection**

The VM drops SSH under disk load, so upload and run together and wrap it in a retry:

```bash
for i in $(seq 1 6); do
  R=$(timeout 150 ssh -i ~/Downloads/PTC-VSS-SF-Interview-VM_key.pem -o ConnectTimeout=30 \
      ptcsfadmin@20.219.132.226 "cat > ~/app/dry.js; cd ~/app && node dry.js; rm -f ~/app/dry.js" \
      < scripts/dry-run-integrity.js 2>&1)
  if echo "$R" | grep -qE "NEW_HIGH_CONCERN|ERR"; then echo "$R"; break; fi
  echo "[$i] retry"; sleep 40
done
```

Expected shape:

```
TOTAL 265
NEW_HIGH_CONCERN <n> (<pct>%)
TRANSITIONS {"high_concern -> review":...,"high_concern -> high_concern":...,...}
```

- [ ] **Step 3: Judge the gate**

- **30–35%, or near it** → the design holds. Proceed to Task 2, quoting the exact number in your report.
- **Materially higher (say >45%)** → something still dominates. Report which transition bucket is largest and STOP.
- **Materially lower (say <15%)** → the rules are now too permissive and real evidence is being dropped. STOP.

Do not proceed on a number outside the band because it "looks close enough". The whole point of this task is that the design is unverified until this runs.

- [ ] **Step 4: Record the measurement**

Append the full output to `.superpowers/sdd/progress.md`. Do **not** commit `scripts/dry-run-integrity.js` — it duplicates the rules in a second place, and a committed copy would quietly drift out of sync with `integrity-rules.ts`. Keep the local file until Task 5 re-runs it, then delete it.

---

### Task 2: Two-layer classification in the rules module

**Files:**
- Modify: `apps/exam-runtime/src/integrity/integrity-rules.ts`
- Test: `apps/exam-runtime/src/integrity/integrity-rules.spec.ts`

**Interfaces:**
- Consumes: the measured gate result from Task 1.
- Produces:
  - `export type EvidenceClass = 'answer' | 'environmental' | 'context'`
  - `export const CONTEXT_EVENT_TYPES: ReadonlySet<string>`
  - `export const FLAG_EVIDENCE_CLASS: Record<IntegrityFlag['type'], EvidenceClass>`
  - `IntegrityFlag['type']` loses `'implausible_speed'`
  - `deriveTelemetryFlags`, `deriveAttemptFlags`, `deriveLevel` keep their existing signatures

- [ ] **Step 1: Write the failing tests**

Append to `apps/exam-runtime/src/integrity/integrity-rules.spec.ts`, and add `CONTEXT_EVENT_TYPES` and `FLAG_EVIDENCE_CLASS` to the existing import from `'./integrity-rules'` at the top of the file:

```typescript
describe('evidence classification', () => {
  // A table test so a future reclassification is a deliberate edit to an assertion,
  // never an accident.
  it.each([
    ['large_paste', 'answer'],
    ['paste_dominant', 'answer'],
    ['similarity_match', 'answer'],
    ['no_iteration', 'answer'],
    ['proctoring_events', 'environmental'],
    ['webcam_violations', 'context'],
  ])('classifies %s as %s', (flag, expected) => {
    expect(FLAG_EVIDENCE_CLASS[flag as keyof typeof FLAG_EVIDENCE_CLASS]).toBe(expected);
  });

  it('classifies every flag type, with no extras', () => {
    expect(Object.keys(FLAG_EVIDENCE_CLASS).sort()).toEqual([
      'large_paste', 'no_iteration', 'paste_dominant', 'proctoring_events', 'similarity_match', 'webcam_violations',
    ]);
  });

  it('treats the three ambiguous event types as context and nothing else', () => {
    expect([...CONTEXT_EVENT_TYPES].sort()).toEqual(['multi_login', 'webcam_head_turned', 'webcam_no_face']);
  });
});

describe('deriveAttemptFlags -- layer 1, context events cannot manufacture a high severity', () => {
  // 65% of real attempts have webcam_head_turned and 62% have webcam_no_face. Before this
  // change a single one of them made the whole attempt high_concern.
  it('does not raise proctoring_events to high for context events alone, however many', () => {
    const events = Array.from({ length: 50 }, () => ({ eventType: 'webcam_no_face', severity: 'high' }));
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).not.toBe('high');
  });

  it('still raises proctoring_events to high for a single hard event', () => {
    const flags = deriveAttemptFlags({
      webcamViolationCount: 0,
      blocked: false,
      events: [{ eventType: 'webcam_multiple_faces', severity: 'high' }],
    });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).toBe('high');
  });

  it('treats an unrecognised event type as hard, not context', () => {
    const flags = deriveAttemptFlags({
      webcamViolationCount: 0,
      blocked: false,
      events: [{ eventType: 'some_future_detector', severity: 'high' }],
    });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).toBe('high');
  });

  it('counts medium events regardless of type, preserving the existing volume rule', () => {
    const events = Array.from({ length: 5 }, () => ({ eventType: 'webcam_head_turned', severity: 'medium' }));
    const flags = deriveAttemptFlags({ webcamViolationCount: 0, blocked: false, events });
    expect(flags.find((f) => f.type === 'proctoring_events')?.severity).toBe('medium');
  });
});

describe('deriveLevel -- layer 2, context-class flags never promote', () => {
  it('returns review, not high_concern, for a high-severity context flag', () => {
    // webcam_violations goes high when the session was blocked. That is context: it says the
    // proctor stopped the session, not that the candidate's ANSWER is suspect.
    expect(deriveLevel([{ type: 'webcam_violations', severity: 'high', detail: '' }])).toBe('review');
  });

  it('returns high_concern for a single high answer-derived flag', () => {
    expect(deriveLevel([{ type: 'paste_dominant', severity: 'high', detail: '' }])).toBe('high_concern');
  });

  it('returns high_concern when a headline flag is high alongside context flags', () => {
    expect(
      deriveLevel([
        { type: 'webcam_violations', severity: 'high', detail: '' },
        { type: 'large_paste', severity: 'high', detail: '' },
      ]),
    ).toBe('high_concern');
  });

  it('returns review for a medium headline flag', () => {
    expect(deriveLevel([{ type: 'large_paste', severity: 'medium', detail: '' }])).toBe('review');
  });

  it('returns clear for no flags', () => {
    expect(deriveLevel([])).toBe('clear');
  });
});
```

- [ ] **Step 2: Delete the test that encodes the old rule**

`integrity-rules.spec.ts` line ~281 contains `it('returns high_concern when any flag is high', ...)`. That assertion **is the bug**. Delete the whole `it` block and leave a comment in its place:

```typescript
// Deliberately removed: this asserted that ANY high flag yields high_concern, which is the
// behaviour that made 75% of real attempts high_concern. Context-class flags no longer
// promote -- see the 'deriveLevel -- layer 2' block below.
```

Do not adapt it. A reader must be able to tell which assertions are intentional.

Then delete any other test in this file that asserts `implausible_speed` behaviour — that flag is being removed, so those tests describe code that will not exist. Name them in your report.

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest --config apps/exam-runtime/jest.config.js --testPathPattern integrity-rules`
Expected: FAIL — `CONTEXT_EVENT_TYPES` and `FLAG_EVIDENCE_CLASS` are not exported.

- [ ] **Step 4: Implement**

In `apps/exam-runtime/src/integrity/integrity-rules.ts`:

Remove `'implausible_speed'` from the `IntegrityFlag['type']` union, delete the `IMPLAUSIBLE_CHARS_PER_SECOND` and `IMPLAUSIBLE_MIN_CHARS` constants, and delete the whole `implausible_speed` block from `deriveTelemetryFlags`. It has never fired in 265 attempts because pasted content registers as `pastedChars`, which `large_paste` and `paste_dominant` already catch.

Add above `deriveAttemptFlags`:

```typescript
export type EvidenceClass = 'answer' | 'environmental' | 'context';

// LAYER 1 -- event types. These fire on a majority of honest candidates (head-turned on 65% of
// real attempts, no-face on 62%), so on their own they carry almost no discriminating
// information: a signal present in two thirds of the population cannot distinguish anyone in
// it. multi_login is here because 145 occurrences across 42 attempts reads like reconnects on
// flaky connections rather than 42 cheats.
//
// An UNKNOWN event type is deliberately NOT treated as context -- see deriveAttemptFlags.
export const CONTEXT_EVENT_TYPES: ReadonlySet<string> = new Set([
  'webcam_head_turned',
  'webcam_no_face',
  'multi_login',
]);

// LAYER 2 -- flag types. Keyed on the union, so adding a flag type without classifying it is a
// compile error rather than a silent demotion to invisible. That matters here specifically:
// the bug being fixed is "important evidence got buried", and a new signal defaulting to
// buried would be the same bug again.
export const FLAG_EVIDENCE_CLASS: Record<IntegrityFlag['type'], EvidenceClass> = {
  large_paste: 'answer',
  paste_dominant: 'answer',
  similarity_match: 'answer',
  no_iteration: 'answer',
  proctoring_events: 'environmental',
  webcam_violations: 'context',
};
```

In `deriveAttemptFlags`, replace the `highEvents` computation:

```typescript
  // Only NON-context high events may raise this to high. An attempt whose only high events are
  // head-turned and no-face gets a medium flag at most, and only then on volume.
  //
  // Note the direction of the unknown-type default: an event type absent from
  // CONTEXT_EVENT_TYPES counts as hard. Event types come from data rather than the type system,
  // so a new detector shipping upstream is treated as meaningful until someone decides
  // otherwise -- the opposite of the flag-type rule above, and deliberately so.
  const highEvents = events.filter((e) => e.severity === 'high' && !CONTEXT_EVENT_TYPES.has(e.eventType));
```

Replace `deriveLevel` entirely:

```typescript
export function deriveLevel(flags: IntegrityFlag[]): IntegrityLevel {
  // A context-class flag can only ever produce `review`, whatever its own severity says.
  const headline = flags.filter((f) => FLAG_EVIDENCE_CLASS[f.type] !== 'context');
  if (headline.some((f) => f.severity === 'high')) return 'high_concern';
  if (flags.length > 0) return 'review';
  return 'clear';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest --config apps/exam-runtime/jest.config.js --testPathPattern integrity`
Expected: PASS.

Then typecheck, which is what proves the `implausible_speed` deletion is complete:

```bash
npx tsc --noEmit -p apps/exam-runtime/tsconfig.json
```

Expected: clean. Any surviving reference to `implausible_speed` is a compile error, because it is gone from the union.

- [ ] **Step 6: Mutation-check both layers**

Each must turn a test red. Restore after each, and report the observed failure.

1. In `deriveAttemptFlags`, drop the `&& !CONTEXT_EVENT_TYPES.has(e.eventType)` filter. The "50 no-face events" test must fail.
2. In `deriveLevel`, change `headline` back to `flags`. The high-severity-context test must fail.

If either survives, the test is inadequate — strengthen the test, not the implementation.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/integrity/integrity-rules.ts apps/exam-runtime/src/integrity/integrity-rules.spec.ts
git commit -m "fix(integrity): stop ambiguous webcam events driving the verdict"
```

---

### Task 3: Let `analyze()` recompute without re-running the AI

**Files:**
- Modify: `apps/exam-runtime/src/integrity/integrity-analysis.service.ts`
- Test: `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts`

**Interfaces:**
- Consumes: `deriveLevel` / `deriveAttemptFlags` from Task 2 (unchanged signatures).
- Produces: `analyze(attemptId: string, options?: { preserveNarrative?: boolean }): Promise<void>`

**Why this task exists.** Today `analyze()` recomputes the narrative on every run and writes whatever it gets, including `null` when the AI call throws (`integrity-analysis.service.ts:141-148`). Production has no AI key, so `aiApiKeyResolver.resolve()` throws and Task 4's backfill would blank the recruiter-facing explanation on all ~223 flagged attempts. Even with a key it would mean 265 paid AI calls to recompute a field that has not changed. The flag/level recomputation is the entire point of the backfill; the narrative is collateral.

The two existing call sites in `attempt-settlement.service.ts` (lines 258 and 418) pass one argument and keep today's behaviour exactly. Do not touch them.

- [ ] **Step 1: Write the failing tests**

Append to `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts`, reusing the existing `mockReadWrite` / `readTxWith` / `persistTx` helpers already defined at the top of that file:

```typescript
describe('analyze with preserveNarrative', () => {
  // A telemetry-flagged answer, so flags.length > 0 and the narrative path would normally run.
  const pastedAnswer = [
    {
      questionId: 'q1',
      answerText: 'x'.repeat(400),
      answerTelemetryJson: JSON.stringify({ typedChars: 10, pastedChars: 400, largestPasteChars: 400 }),
      question: { id: 'q1', type: 'code', marks: 10 },
    },
  ];

  it('does not call the AI narrative client', async () => {
    const persist = persistTx();
    mockReadWrite(readTxWith(pastedAnswer), persist);

    await service.analyze('attempt-1', { preserveNarrative: true });

    expect(integrityNarrativeClient.writeNarrative).not.toHaveBeenCalled();
    // Not resolving the key matters as much as not calling the client: with no key configured
    // in production, resolve() throws, and that is what would have nulled the narrative.
    expect(aiApiKeyResolver.resolve).not.toHaveBeenCalled();
  });

  it('omits narrative from the update so an existing explanation survives', async () => {
    const persist = persistTx();
    mockReadWrite(readTxWith(pastedAnswer), persist);

    await service.analyze('attempt-1', { preserveNarrative: true });

    const args = persist.integrityAnalysis.upsert.mock.calls[0][0];
    expect(args.update).not.toHaveProperty('narrative');
    expect(args.update.level).toBeDefined();
    expect(args.update.flagsJson).toBeDefined();
  });

  it('records no AI credit usage', async () => {
    const persist = persistTx();
    mockReadWrite(readTxWith(pastedAnswer), persist);

    await service.analyze('attempt-1', { preserveNarrative: true });

    expect(persist.aiCreditUsage.create).not.toHaveBeenCalled();
  });

  it('still writes the narrative on the default path', async () => {
    integrityNarrativeClient.writeNarrative.mockResolvedValue('a narrative');
    const persist = persistTx();
    mockReadWrite(readTxWith(pastedAnswer), persist);

    await service.analyze('attempt-1');

    const args = persist.integrityAnalysis.upsert.mock.calls[0][0];
    expect(args.update.narrative).toBe('a narrative');
    expect(integrityNarrativeClient.writeNarrative).toHaveBeenCalled();
  });
});
```

If the flag-producing fixture above does not actually yield a flag once Task 2 has landed, adjust the telemetry values so it does — the point of the fixture is `flags.length > 0`, not those specific numbers. Say so in your report if you change them.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest --config apps/exam-runtime/jest.config.js --testPathPattern integrity-analysis`
Expected: FAIL — `analyze` takes one argument, so the narrative client is still called and `update` still carries `narrative`.

- [ ] **Step 3: Implement**

Change the signature:

```typescript
  async analyze(attemptId: string, options?: { preserveNarrative?: boolean }): Promise<void> {
```

Replace the narrative block (currently lines 136-149):

```typescript
      let narrative: string | null = null;
      let narrativeSucceeded = false;
      if (options?.preserveNarrative) {
        // Backfill path: re-deriving flags must not re-run the AI. This is not an optimisation
        // -- with no AI key configured the call throws, and the upsert below would then write
        // null over an explanation a recruiter has already read.
      } else if (flags.length === 0) {
        narrative = CLEAR_NARRATIVE;
      } else {
        try {
          const aiProvider = await this.aiApiKeyResolver.resolve(organizationId);
          narrative = await this.integrityNarrativeClient.writeNarrative(flags, { examTitle, level }, aiProvider);
          narrativeSucceeded = true;
        } catch (error) {
          this.logger.error(`Integrity narrative generation failed for attempt ${attemptId}`, error as Error);
          narrative = null;
        }
      }
```

Then replace the persist block (currently lines 156-168):

```typescript
      const core = { status: 'completed', level, flagsJson: JSON.stringify(flags) };
      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
        await tx.integrityAnalysis.upsert({
          where: { attemptId },
          // A brand-new row still gets whatever narrative was computed -- on the preserve path
          // that is the disclosure alone, or null, because there is nothing yet to preserve.
          create: { attemptId, ...core, narrative },
          update: options?.preserveNarrative
            ? { ...core, analyzedAt: new Date() }
            : { ...core, narrative, analyzedAt: new Date() },
        });
        if (narrativeSucceeded) {
          await tx.aiCreditUsage.create({
            data: { organizationId, source: 'integrity_narrative', credits: 1, sourceId: attemptId },
          });
        }
      });
```

Leave the `bypassDisclosure` block between them exactly as it is. On the preserve path `narrative` starts null, so the disclosure still composes correctly for the `create` case, and `update` ignores it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest --config apps/exam-runtime/jest.config.js --testPathPattern integrity-analysis`
Expected: PASS, including every pre-existing test in the file — the default path must be unchanged in behaviour.

- [ ] **Step 5: Mutation-check the preserve path**

Change `update:` back to unconditionally `{ ...core, narrative, analyzedAt: new Date() }`. The "omits narrative from the update" test must fail. Restore, and report the observed failure. This is the single assertion standing between the backfill and ~223 destroyed narratives.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/integrity/integrity-analysis.service.ts apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts
git commit -m "feat(integrity): recompute analyses without re-running the narrative AI"
```

---

### Task 4: The backfill script

**Files:**
- Create: `scripts/recompute-integrity.ts`

**Interfaces:**
- Consumes: `IntegrityAnalysisService.analyze(attemptId, { preserveNarrative: true })` from Task 3.
- Produces: a script that recomputes every submitted attempt and reports the transition matrix.

- [ ] **Step 1: Write the script**

```typescript
/**
 * One-off: recompute every submitted attempt's integrity analysis under the calibrated rules.
 *
 * Sequential on purpose. Each analyze() opens three forTenant transactions against a pool of
 * 15, so firing 265 concurrently would exhaust it and start returning server_busy to live
 * traffic. A serial loop takes minutes and costs nothing.
 *
 * Idempotent: analyze() upserts on attemptId and has no "already analysed" guard, so this is
 * safe to re-run -- which matters because the VM drops SSH for minutes at a time under disk
 * load and the run may need resuming.
 *
 * preserveNarrative keeps the recruiter-facing explanation. Without it, the AI call fails on a
 * box with no key configured and every flagged attempt's narrative is written as null.
 *
 * Usage on the VM:  cd ~/app && npx ts-node scripts/recompute-integrity.ts
 */
import { NestFactory } from '@nestjs/core';
import { TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../apps/exam-runtime/src/app.module';
import { IntegrityAnalysisService } from '../apps/exam-runtime/src/integrity/integrity-analysis.service';

const SUPER_ADMIN = { organizationId: null, isSuperAdmin: true };

type Row = { attempt_id: string; level: string | null };

async function snapshot(tenantPrisma: TenantPrismaService): Promise<Row[]> {
  return tenantPrisma.forTenant(SUPER_ADMIN, (tx) =>
    tx.$queryRawUnsafe<Row[]>(
      'SELECT ia.attempt_id, ia.level FROM integrity_analyses ia ' +
        'JOIN attempts a ON a.id = ia.attempt_id WHERE a.submitted_at IS NOT NULL',
    ),
  );
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['warn', 'error'] });
  const analysis = app.get(IntegrityAnalysisService);
  const tenantPrisma = app.get(TenantPrismaService);

  const before = await snapshot(tenantPrisma);
  console.log(`recomputing ${before.length} analyses`);

  const previous = new Map(before.map((r) => [r.attempt_id, r.level]));
  let done = 0;
  for (const row of before) {
    // analyze() catches its own errors and logs rather than throwing, so a try/catch here would
    // report zero failures whatever happened. Failures are detected from the second snapshot
    // instead -- see NULL_LEVEL below -- and the reason is in the exam-runtime log.
    await analysis.analyze(row.attempt_id, { preserveNarrative: true });
    done += 1;
    if (done % 25 === 0) console.log(`  ${done}/${before.length}`);
  }

  const after = await snapshot(tenantPrisma);
  const matrix: Record<string, number> = {};
  for (const row of after) {
    const key = `${previous.get(row.attempt_id) ?? 'none'} -> ${row.level ?? 'none'}`;
    matrix[key] = (matrix[key] ?? 0) + 1;
  }
  const high = after.filter((r) => r.level === 'high_concern').length;
  const nulls = after.filter((r) => r.level === null).length;

  console.log(`TRANSITIONS ${JSON.stringify(matrix)}`);
  console.log(`NEW_HIGH_CONCERN ${high} of ${after.length} (${Math.round((high / after.length) * 100)}%)`);
  console.log(`NULL_LEVEL ${nulls}`);
  await app.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

`NULL_LEVEL` is the failure detector: `analyze()` swallows its own errors, so an attempt that blew up leaves its row untouched rather than crashing the run. A non-zero count means something needs investigating before the result is trusted.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p apps/exam-runtime/tsconfig.json
```

Expected: clean. If `scripts/` falls outside that tsconfig's `include`, say so in your report and verify the script compiles standalone instead — do not widen the app's build config for a one-off script.

- [ ] **Step 3: Commit**

```bash
git add scripts/recompute-integrity.ts
git commit -m "chore(integrity): one-off backfill recomputing historical analyses"
```

---

### Task 5: Full verification

**Files:** none — verification only. The backfill is NOT run here; it writes production data and belongs with the deploy, after the new rules are live. Running it against the currently-deployed code would recompute using exactly the rules being replaced.

- [ ] **Step 1: Full suites and typechecks**

```bash
npm run build --workspace=packages/shared
npx jest --config apps/exam-runtime/jest.config.js
npx jest --config apps/api/jest.config.js
npx tsc --noEmit -p apps/exam-runtime/tsconfig.json
npx tsc --noEmit -p apps/api/tsconfig.json
```

Expected: all green. api baseline 893. exam-runtime was 692 before this work; it will differ by the deleted `implausible_speed` and old-level tests plus the tests added in Tasks 2 and 3 — report the number and account for the delta, rather than asserting a figure.

- [ ] **Step 2: Confirm `implausible_speed` is entirely gone**

```bash
grep -rn "implausible_speed\|IMPLAUSIBLE_" apps packages --include=*.ts | grep -v node_modules
```

Expected: no matches outside a comment explaining the removal. A leftover constant is dead code that reads as a live rule.

- [ ] **Step 3: Confirm the settlement call sites are untouched**

```bash
git diff main --stat -- apps/exam-runtime/src/attempts/
```

Expected: empty. Settlement must keep calling `analyze(attemptId)` with one argument, so live attempts still generate narratives.

- [ ] **Step 4: Re-confirm the gate against the shipped rules**

Task 1 measured a *simulation*. Re-run `scripts/dry-run-integrity.js` unchanged (Task 1, Step 2) and compare.

The number must match Task 1's within a couple of percent. **A divergence means the implementation and the simulation disagree**, and the implementation is what ships — investigate before deploying, since the gate that authorised this work would no longer apply to what was built.

Then delete the local `scripts/dry-run-integrity.js`.

- [ ] **Step 5: Record**

Append to `.superpowers/sdd/progress.md`: the suite counts and their delta, the `implausible_speed` grep result, the settlement-diff check, and both gate measurements side by side.
