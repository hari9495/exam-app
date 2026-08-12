# Face Identification — Stage 2 (Verification) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify during an exam that the face on camera is the same person who enrolled, record the verdict as evidence, and give recruiters a per-exam choice of what to do about it.

**Architecture:** Two tiers with different jobs. The **browser tier is advisory** — it embeds a frame locally, compares against the reference, and uses the result only to tell the candidate something actionable ("we can't see your face clearly"); it never produces a verdict. The **server tier is authoritative** — it re-embeds the snapshot exam-runtime already receives, compares, and emits the single `face_mismatch` event that drives enforcement. Both use the same embedding model so scores are comparable.

**Tech Stack:** ONNX Runtime (`onnxruntime-node` server-side, `onnxruntime-web` in the browser), EdgeFace embedding weights (BSD-3, path parameterised), Prisma + Azure SQL, NestJS, Next.js. Reuses stage 1's `FaceEnrolment`, the existing webcam snapshot pipeline, `OrgSecretsCryptoService`, and the proctoring action ladder.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-face-identification-design.md`. Stage 2 only.
- **NOT in this stage:** anti-spoofing, threshold calibration, the fairness check, concurrency measurement. All stage 3.
- **Every exam ships defaulted to `flag`.** `warn` / `pause` / `block` are built and selectable, but the recruiter UI must carry a visible note that they should not be enabled until stage 3's calibration and fairness check are done. `flag` only records — a provisional threshold under `flag` produces a noisy log line, never a harmed candidate. That is precisely why the machinery can ship before calibration.
- **Thresholds are provisional and marked as such in code.** Do not present them as tuned. Stage 3 replaces them.
- **The model is a parameter, not a constant.** The weights path comes from env (`FACE_EMBEDDING_MODEL_PATH`, `NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL`). A licensing answer must be able to swap the file without a code change.
- **Licensing gate:** EdgeFace's *code* is BSD-3 (verified). Whether the released *weights* inherit a research-only restriction from their training dataset is unresolved and owned by Prudent's licensing contact. Task 1 stops if that answer is "no commercial use".
- **"Can't tell" is never "not you."** An absent, tiny or unusable face is the existing `no_face` violation, which already has handling. It must never be reported as a mismatch.
- Blob reads/writes never inside a `tenantPrisma.forTenant` transaction (connection-pool starvation).
- Never persist a SAS-signed URL — store the path, sign on read.
- The reference embedding is **biometric special-category data**: encrypted at rest with `OrgSecretsCryptoService`, covered by GDPR erase and the 90-day retention job (both already exist and already null the `embedding` column — verify, do not rebuild).
- Run the changed workspace's `npx jest` (`--maxWorkers=2` for the two Nest apps — the default OOMs V8 on this machine) and `npx tsc --noEmit` before every commit.

---

## File structure

| File | Responsibility |
|---|---|
| `packages/shared/src/face/similarity.ts` | Pure: cosine similarity + three-band classification. Used by both tiers, so it lives where both can import it. |
| `packages/shared/src/face/embedding-codec.ts` | Pure: `Float32Array` ⇄ compact string, for the encrypted column. |
| `apps/exam-runtime/src/face/face-embedder.service.ts` | Owns the ONNX session. One responsibility: bytes in, vector out. |
| `apps/exam-runtime/src/face/mismatch-voter.ts` | Pure: consecutive-confirmation before escalation. |
| `apps/exam-runtime/src/face/face-verification.service.ts` | Orchestrates compare → classify → vote → event. The only place a verdict is produced. |
| `apps/web/lib/face-embedder.ts` | Browser ONNX session, advisory only. |
| `apps/api/src/exams/*`, `apps/web/components/*` | The per-exam action setting and the report's side-by-side evidence. |

Kept deliberately small: the embedder does not know about thresholds, the classifier does not know about ONNX, and the voter does not know about events. That is what lets each be tested without the others.

---

### Task 1: Acquire and verify the model weights (gated)

**This task can stop the stage.** Do it first and report before writing code.

**Files:**
- Create: `docs/superpowers/notes/2026-08-11-face-model-licence.md`

**Interfaces:**
- Produces: a vendored ONNX weights file and a written licence finding. No code.

- [ ] **Step 1: Establish what the weights are trained on**

Read the EdgeFace paper's dataset section and the release notes at `https://github.com/otroshi/edgeface` and `https://gitlab.idiap.ch/bob/bob.paper.tbiom2023_edgeface`. The repository code is BSD-3-Clause (already verified). The open question is whether the **released weights** inherit restrictions from their training dataset — MS-Celeb-1M was withdrawn by Microsoft, and CASIA-WebFace / WebFace260M are research-only.

- [ ] **Step 2: Write the finding down**

Create `docs/superpowers/notes/2026-08-11-face-model-licence.md` recording: the repo licence, the training dataset, that dataset's terms, and a plain yes/no on commercial use with the sentence you are relying on quoted verbatim.

- [ ] **Step 3: Stop if the answer is no**

If the weights are research-only, **do not proceed**. Report it. The design is unaffected — only the weights file changes — but someone must choose a permissively-licensed alternative first.

- [ ] **Step 4: Vendor the weights**

Download the EdgeFace-S ONNX weights. Place them at `apps/exam-runtime/models/face-embedder.onnx` and `apps/web/public/models/face-embedder.onnx`. Add both to `.gitignore` — they are binaries fetched at build time, exactly as `public/monaco` already is. Add a `scripts/fetch-face-model.mjs` that downloads them, modelled on `apps/web/scripts/copy-monaco.mjs`.

Record the file size in your report. **On a VM whose P6 disk already collapses during deploys, this number matters** — if the pair exceeds ~50MB, say so explicitly, because it moves the P10 disk resize from advisable to required.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/notes/2026-08-11-face-model-licence.md apps/web/scripts/fetch-face-model.mjs .gitignore
git commit -m "chore(face-id): vendor the face embedding model and record its licence position"
```

---

### Task 2: Similarity and three-band classification (pure)

The single most important piece of judgement in the stage, and the cheapest to get right in isolation.

**Files:**
- Create: `packages/shared/src/face/similarity.ts`
- Test: `packages/shared/src/face/similarity.spec.ts`
- Modify: `packages/shared/src/index.ts` (export)

**Interfaces:**
- Produces: `cosineSimilarity(a: Float32Array, b: Float32Array): number`;
  `classifySimilarity(score: number, thresholds?: SimilarityThresholds): FaceVerdict`
  where `type FaceVerdict = 'match' | 'uncertain' | 'mismatch'` and
  `interface SimilarityThresholds { high: number; low: number }`;
  `PROVISIONAL_THRESHOLDS: SimilarityThresholds`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/face/similarity.spec.ts`:

```ts
import { cosineSimilarity, classifySimilarity, PROVISIONAL_THRESHOLDS } from './similarity';

const vec = (...xs: number[]) => Float32Array.from(xs);

describe('cosineSimilarity', () => {
  it('is 1 for identical directions', () => {
    expect(cosineSimilarity(vec(1, 0, 0), vec(1, 0, 0))).toBeCloseTo(1, 6);
  });

  it('ignores magnitude — only direction matters', () => {
    expect(cosineSimilarity(vec(1, 2, 3), vec(10, 20, 30))).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(vec(1, 0), vec(0, 1))).toBeCloseTo(0, 6);
  });

  it('is -1 for opposite directions', () => {
    expect(cosineSimilarity(vec(1, 0), vec(-1, 0))).toBeCloseTo(-1, 6);
  });

  // A zero vector has no direction. Returning 0 rather than NaN matters because NaN would
  // silently compare FALSE against both thresholds and land in the uncertain band by accident,
  // which is the right outcome for the wrong reason and impossible to debug later.
  it('returns 0 rather than NaN when a vector is all zeros', () => {
    expect(cosineSimilarity(vec(0, 0), vec(1, 0))).toBe(0);
  });

  it('throws on mismatched lengths instead of comparing nonsense', () => {
    expect(() => cosineSimilarity(vec(1, 0), vec(1, 0, 0))).toThrow(/length/i);
  });
});

describe('classifySimilarity', () => {
  const t = { high: 0.6, low: 0.4 };

  it('calls a clearly high score a match', () => {
    expect(classifySimilarity(0.9, t)).toBe('match');
  });

  it('calls a clearly low score a mismatch', () => {
    expect(classifySimilarity(0.1, t)).toBe('mismatch');
  });

  // The uncertain band is the whole point: it absorbs bad lighting, a turned head, a candidate
  // mid-sip. Without it, every marginal frame becomes an accusation.
  it('calls anything between the thresholds uncertain', () => {
    expect(classifySimilarity(0.5, t)).toBe('uncertain');
  });

  it('treats the boundaries as inclusive on the safe side', () => {
    expect(classifySimilarity(0.6, t)).toBe('match');
    expect(classifySimilarity(0.4, t)).toBe('uncertain');
  });

  it('defaults to the provisional thresholds when none are given', () => {
    expect(classifySimilarity(0.99)).toBe('match');
    expect(classifySimilarity(-0.99)).toBe('mismatch');
  });

  it('exposes provisional thresholds with high strictly above low', () => {
    expect(PROVISIONAL_THRESHOLDS.high).toBeGreaterThan(PROVISIONAL_THRESHOLDS.low);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "D:/exam-app-face-id/packages/shared" && npx jest similarity`
Expected: FAIL — `Cannot find module './similarity'`.

- [ ] **Step 3: Implement**

Create `packages/shared/src/face/similarity.ts`:

```ts
export type FaceVerdict = 'match' | 'uncertain' | 'mismatch';

export interface SimilarityThresholds {
  /** At or above this, the same person. */
  high: number;
  /** Below this, a different person. Between the two, we do not know. */
  low: number;
}

// PROVISIONAL. These are starting values, NOT calibrated ones. They are safe to ship only
// because stage 2 defaults every exam to `flag`, which records a verdict and acts on nothing.
// Stage 3 replaces them with values measured against a labelled fixture set of real captures,
// and enforcement beyond `flag` must not be enabled until it does.
export const PROVISIONAL_THRESHOLDS: SimilarityThresholds = { high: 0.6, low: 0.4 };

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  // A zero vector has no direction, so no meaningful similarity. Return 0, never NaN --
  // NaN compares false against both thresholds and would land in `uncertain` by accident.
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Three bands, not two. Forcing a binary decision on a marginal frame is where false
// accusations come from; the middle band records a score and does nothing.
export function classifySimilarity(
  score: number,
  thresholds: SimilarityThresholds = PROVISIONAL_THRESHOLDS,
): FaceVerdict {
  if (score >= thresholds.high) return 'match';
  if (score < thresholds.low) return 'mismatch';
  return 'uncertain';
}
```

Export both from `packages/shared/src/index.ts` alongside the existing exports.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam-app-face-id/packages/shared" && npx jest similarity`
Expected: 13 passed.

- [ ] **Step 5: Build shared so the apps can import it**

Run: `cd "D:/exam-app-face-id" && npm run build --workspace=packages/shared`
Expected: build succeeds, `packages/shared/dist/face/similarity.js` exists.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/face/similarity.ts packages/shared/src/face/similarity.spec.ts packages/shared/src/index.ts
git commit -m "feat(face-id): cosine similarity with three-band classification"
```

---

### Task 3: Embedding codec (pure)

**Files:**
- Create: `packages/shared/src/face/embedding-codec.ts`
- Test: `packages/shared/src/face/embedding-codec.spec.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `encodeEmbedding(v: Float32Array): string`, `decodeEmbedding(s: string): Float32Array`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/face/embedding-codec.spec.ts`:

```ts
import { encodeEmbedding, decodeEmbedding } from './embedding-codec';

describe('embedding codec', () => {
  it('round-trips a vector without losing precision that matters', () => {
    const original = Float32Array.from([0.1234567, -0.9876543, 0, 1, -1]);
    const restored = decodeEmbedding(encodeEmbedding(original));
    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i += 1) {
      expect(restored[i]).toBeCloseTo(original[i], 6);
    }
  });

  it('produces a compact string, not JSON', () => {
    // 512 floats as JSON is ~10KB; base64 of the raw buffer is ~2.7KB. The column is encrypted
    // and sits on every attempt, so the difference is worth having.
    const encoded = encodeEmbedding(new Float32Array(512));
    expect(encoded.length).toBeLessThan(3000);
    expect(encoded.startsWith('[')).toBe(false);
  });

  it('rejects a corrupt string rather than returning a silently wrong vector', () => {
    expect(() => decodeEmbedding('not-base64-at-all!!')).toThrow();
  });

  it('round-trips an empty vector', () => {
    expect(decodeEmbedding(encodeEmbedding(new Float32Array(0))).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "D:/exam-app-face-id/packages/shared" && npx jest embedding-codec`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/face/embedding-codec.ts`:

```ts
// Base64 of the raw float buffer. Chosen over JSON because this value is encrypted and stored
// on every enrolment: 512 floats are ~2.7KB here versus ~10KB as JSON text.
export function encodeEmbedding(vector: Float32Array): string {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString('base64');
}

export function decodeEmbedding(encoded: string): Float32Array {
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length % 4 !== 0) {
    throw new Error(`Corrupt embedding: ${buffer.length} bytes is not a whole number of floats`);
  }
  // Copy rather than aliasing Buffer's pooled memory -- a view over the pool would be
  // corrupted by an unrelated later allocation.
  const copy = new ArrayBuffer(buffer.length);
  new Uint8Array(copy).set(buffer);
  return new Float32Array(copy);
}
```

Export both from `packages/shared/src/index.ts`.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam-app-face-id/packages/shared" && npx jest embedding-codec`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/face/embedding-codec.ts packages/shared/src/face/embedding-codec.spec.ts packages/shared/src/index.ts
git commit -m "feat(face-id): compact codec for storing face embeddings"
```

---

### Task 4: Consecutive-confirmation voter (pure)

Stage 1's browser voter (`apps/web/lib/webcam-voting.ts`) is a sliding window with latching. The server needs something different and stricter: **N consecutive** disagreements, reset by any non-mismatch. It lives in exam-runtime because `apps/web` cannot be imported there.

**Files:**
- Create: `apps/exam-runtime/src/face/mismatch-voter.ts`
- Test: `apps/exam-runtime/src/face/mismatch-voter.spec.ts`

**Interfaces:**
- Consumes: `FaceVerdict` from `@exam-platform/shared`.
- Produces: `createMismatchVoter(consecutive?: number): MismatchVoter` where
  `interface MismatchVoter { push(verdict: FaceVerdict): boolean; reset(): void }`;
  `CONSECUTIVE_MISMATCHES_TO_CONFIRM: number`.

- [ ] **Step 1: Write the failing test**

Create `apps/exam-runtime/src/face/mismatch-voter.spec.ts`:

```ts
import { createMismatchVoter, CONSECUTIVE_MISMATCHES_TO_CONFIRM } from './mismatch-voter';

describe('createMismatchVoter', () => {
  it('does not confirm on a single mismatch', () => {
    const voter = createMismatchVoter(3);
    expect(voter.push('mismatch')).toBe(false);
  });

  it('confirms only on the Nth consecutive mismatch', () => {
    const voter = createMismatchVoter(3);
    expect(voter.push('mismatch')).toBe(false);
    expect(voter.push('mismatch')).toBe(false);
    expect(voter.push('mismatch')).toBe(true);
  });

  // The candidate turned back to the camera. That must clear the run, or a mismatch an hour
  // ago could combine with two now to accuse someone.
  it('a match resets the run', () => {
    const voter = createMismatchVoter(3);
    voter.push('mismatch');
    voter.push('mismatch');
    expect(voter.push('match')).toBe(false);
    expect(voter.push('mismatch')).toBe(false);
  });

  // 'uncertain' is the "we do not know" band. It must not count toward an accusation, and it
  // must not preserve a run either -- a run interrupted by ignorance is not a run.
  it('an uncertain verdict resets the run rather than counting toward it', () => {
    const voter = createMismatchVoter(3);
    voter.push('mismatch');
    voter.push('mismatch');
    expect(voter.push('uncertain')).toBe(false);
    expect(voter.push('mismatch')).toBe(false);
  });

  it('does not re-confirm on every subsequent mismatch once it has fired', () => {
    const voter = createMismatchVoter(2);
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
    expect(voter.push('mismatch')).toBe(false);
  });

  it('re-arms after a match, so a genuinely new episode can fire again', () => {
    const voter = createMismatchVoter(2);
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
    voter.push('match');
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
  });

  it('reset() clears both the run and the fired latch', () => {
    const voter = createMismatchVoter(2);
    voter.push('mismatch');
    voter.push('mismatch');
    voter.reset();
    voter.push('mismatch');
    expect(voter.push('mismatch')).toBe(true);
  });

  it('defaults to the shared constant', () => {
    const voter = createMismatchVoter();
    for (let i = 1; i < CONSECUTIVE_MISMATCHES_TO_CONFIRM; i += 1) {
      expect(voter.push('mismatch')).toBe(false);
    }
    expect(voter.push('mismatch')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest mismatch-voter`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/exam-runtime/src/face/mismatch-voter.ts`:

```ts
import type { FaceVerdict } from '@exam-platform/shared';

// PROVISIONAL, like the thresholds. Trades detection speed against false accusations: higher
// means a wrongly-classified frame is less likely to accuse anyone, at the cost of noticing a
// real swap later. Stage 3 sets this against the fixture set.
export const CONSECUTIVE_MISMATCHES_TO_CONFIRM = 3;

export interface MismatchVoter {
  /** Returns true exactly once, on the push that confirms a mismatch episode. */
  push(verdict: FaceVerdict): boolean;
  reset(): void;
}

// Consecutive, not a sliding window. A run broken by a match OR by an uncertain frame is not a
// run: 'uncertain' means we could not tell, and ignorance must never accumulate into an
// accusation. Latches after firing so one episode produces one event, not one per snapshot.
export function createMismatchVoter(consecutive: number = CONSECUTIVE_MISMATCHES_TO_CONFIRM): MismatchVoter {
  let run = 0;
  let fired = false;

  return {
    push(verdict) {
      if (verdict !== 'mismatch') {
        run = 0;
        fired = false;
        return false;
      }
      run += 1;
      if (run >= consecutive && !fired) {
        fired = true;
        return true;
      }
      return false;
    },
    reset() {
      run = 0;
      fired = false;
    },
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest mismatch-voter`
Expected: 8 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/face/mismatch-voter.ts apps/exam-runtime/src/face/mismatch-voter.spec.ts
git commit -m "feat(face-id): consecutive-confirmation voter for mismatch episodes"
```

---

### Task 5: Server-side embedder service

**Files:**
- Create: `apps/exam-runtime/src/face/face-embedder.service.ts`
- Create: `apps/exam-runtime/src/face/face.module.ts`
- Test: `apps/exam-runtime/src/face/face-embedder.service.spec.ts`
- Modify: `apps/exam-runtime/package.json` (add `onnxruntime-node`), `apps/exam-runtime/src/app.module.ts`

**Interfaces:**
- Produces: `FaceEmbedderService.embed(image: Buffer): Promise<Float32Array | null>` — returns `null` when the model is unavailable or the image cannot be decoded. **Never throws into a caller's hot path.**
- Produces: `FaceEmbedderService.isAvailable(): boolean`.

- [ ] **Step 1: Add the dependency**

Run: `cd "D:/exam-app-face-id" && npm install onnxruntime-node --workspace=apps/exam-runtime`

This is the one place stage 2 is allowed to add a dependency. Record the installed version in your report.

- [ ] **Step 2: Write the failing test**

Create `apps/exam-runtime/src/face/face-embedder.service.spec.ts`:

```ts
import { FaceEmbedderService } from './face-embedder.service';

describe('FaceEmbedderService', () => {
  // The whole feature degrades to "no verdict" when the model is missing. It must NEVER
  // degrade to an accusation, and must never take the exam-runtime process down at boot.
  it('reports unavailable and returns null when no model path is configured', async () => {
    const service = new FaceEmbedderService({ get: () => undefined } as never);
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(false);
    expect(await service.embed(Buffer.from('anything'))).toBeNull();
  });

  it('reports unavailable when the configured model file does not exist', async () => {
    const service = new FaceEmbedderService({ get: () => 'C:/definitely/not/here.onnx' } as never);
    await service.onModuleInit();
    expect(service.isAvailable()).toBe(false);
  });

  it('returns null rather than throwing when handed bytes that are not an image', async () => {
    const service = new FaceEmbedderService({ get: () => undefined } as never);
    await service.onModuleInit();
    await expect(service.embed(Buffer.from([0, 1, 2, 3]))).resolves.toBeNull();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest face-embedder`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `apps/exam-runtime/src/face/face-embedder.service.ts`:

```ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'node:fs';

// The model is a PARAMETER, not a constant: the weights choice is still subject to a licensing
// answer, and swapping the file must not require a code change.
const MODEL_PATH_KEY = 'FACE_EMBEDDING_MODEL_PATH';

@Injectable()
export class FaceEmbedderService implements OnModuleInit {
  private readonly logger = new Logger(FaceEmbedderService.name);
  private session: unknown = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const path = this.config.get<string>(MODEL_PATH_KEY);
    if (!path || !existsSync(path)) {
      // Deliberately not fatal. An exam-runtime that refuses to boot because a model file is
      // missing would take down every candidate's exam over an optional feature.
      this.logger.warn(`Face embedding model not available (${MODEL_PATH_KEY}=${path ?? 'unset'}); verification is disabled`);
      return;
    }
    try {
      const ort = await import('onnxruntime-node');
      this.session = await ort.InferenceSession.create(path);
      this.logger.log(`Face embedding model loaded from ${path}`);
    } catch (error) {
      this.logger.error(`Failed to load face embedding model: ${(error as Error).message}`);
      this.session = null;
    }
  }

  isAvailable(): boolean {
    return this.session !== null;
  }

  async embed(image: Buffer): Promise<Float32Array | null> {
    if (!this.session) return null;
    try {
      const ort = await import('onnxruntime-node');
      const tensor = await this.toInputTensor(ort, image);
      if (!tensor) return null;
      const session = this.session as { inputNames: string[]; run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>> };
      const output = await session.run({ [session.inputNames[0]]: tensor });
      const first = Object.values(output)[0];
      return first ? Float32Array.from(first.data) : null;
    } catch (error) {
      // Every failure here degrades to "no verdict". Never an accusation, never a throw into
      // the snapshot pipeline.
      this.logger.warn(`Face embedding failed: ${(error as Error).message}`);
      return null;
    }
  }

  // Decode to the model's expected input. EdgeFace takes a 112x112 RGB tensor normalised to
  // [-1, 1] in NCHW order. `sharp` is already a dependency of this repo.
  private async toInputTensor(ort: typeof import('onnxruntime-node'), image: Buffer): Promise<unknown | null> {
    try {
      const sharp = (await import('sharp')).default;
      const { data } = await sharp(image).removeAlpha().resize(112, 112, { fit: 'cover' }).raw().toBuffer({ resolveWithObject: true });
      const floats = new Float32Array(3 * 112 * 112);
      const plane = 112 * 112;
      for (let i = 0; i < plane; i += 1) {
        floats[i] = (data[i * 3] / 255 - 0.5) / 0.5;
        floats[plane + i] = (data[i * 3 + 1] / 255 - 0.5) / 0.5;
        floats[plane * 2 + i] = (data[i * 3 + 2] / 255 - 0.5) / 0.5;
      }
      return new ort.Tensor('float32', floats, [1, 3, 112, 112]);
    } catch {
      return null;
    }
  }
}
```

Create `apps/exam-runtime/src/face/face.module.ts` providing and exporting `FaceEmbedderService`, and register it in `apps/exam-runtime/src/app.module.ts`.

- [ ] **Step 5: Run the tests**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest face-embedder`
Expected: 3 passed.

- [ ] **Step 6: Prove it embeds a real image**

Write a throwaway script that loads the vendored model, embeds two different photographs and the same photograph twice, and prints the three cosine similarities. **Same photo must score near 1.0; two different faces must score clearly lower.** If that does not hold, the preprocessing is wrong and everything downstream is meaningless — stop and report rather than continuing. Paste the three numbers into your report, then delete the script.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/face apps/exam-runtime/src/app.module.ts apps/exam-runtime/package.json package-lock.json
git commit -m "feat(face-id): server-side ONNX face embedder that degrades to no-verdict"
```

---

### Task 6: Populate and encrypt the reference embedding at enrolment

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`recordFaceEnrolment`)
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `FaceEmbedderService.embed`, `encodeEmbedding`, `OrgSecretsCryptoService.encrypt`.
- Produces: `FaceEnrolment.embedding` populated with an encrypted, encoded vector.

- [ ] **Step 1: Write the failing tests**

Add to `apps/exam-runtime/src/attempts/attempt.service.spec.ts`:

```ts
  describe('recordFaceEnrolment — reference embedding', () => {
    it('stores the embedding ENCRYPTED, never as a bare vector', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn().mockResolvedValue(Float32Array.from([0.1, 0.2, 0.3]));
      crypto.encrypt = jest.fn((plain: string) => `enc(${plain})`);
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob/face/a1.jpg');
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true });

      expect(crypto.encrypt).toHaveBeenCalled();
      expect(upsert.mock.calls[0][0].create.embedding).toMatch(/^enc\(/);
    });

    // The photo is the evidence a human reviews. If embedding fails, we must still keep it --
    // losing the reference over a model problem would make the attempt unverifiable forever.
    it('still enrols with a null embedding when the model is unavailable', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn().mockResolvedValue(null);
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob/face/a1.jpg');
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true });

      expect(upsert.mock.calls[0][0].create.embedding).toBeNull();
      expect(upsert.mock.calls[0][0].create.status).toBe('enrolled');
    });

    it('does not attempt to embed a declined enrolment', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      faceEmbedder.embed = jest.fn();
      mockBootstrapThenTwoScopedCalls({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'not_verified', consentGiven: false });

      expect(faceEmbedder.embed).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest attempt.service -t "reference embedding"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `recordFaceEnrolment`, after the blob upload and **outside** any `forTenant` transaction, decode the data URI to a Buffer, call `this.faceEmbedder.embed(buffer)`, and when it returns a vector set `embedding: this.crypto.encrypt(encodeEmbedding(vector))`. When it returns null, set `embedding: null` and carry on. Inject `FaceEmbedderService` and `OrgSecretsCryptoService` through the constructor, and import `FaceModule` / `CryptoModule` where `AttemptsModule` is declared.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest attempt.service --maxWorkers=2`
Expected: all pass, including the three new ones.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts
git commit -m "feat(face-id): compute and encrypt the reference embedding at enrolment"
```

---

### Task 7: The verification service — the only place a verdict is produced

**Files:**
- Create: `apps/exam-runtime/src/face/face-verification.service.ts`
- Test: `apps/exam-runtime/src/face/face-verification.service.spec.ts`
- Modify: `apps/exam-runtime/src/face/face.module.ts`

**Interfaces:**
- Consumes: `FaceEmbedderService`, `OrgSecretsCryptoService`, `decodeEmbedding`, `cosineSimilarity`, `classifySimilarity`, `createMismatchVoter`, `TenantPrismaService`.
- Produces: `FaceVerificationService.verifySnapshot(attemptId: string, organizationId: string, snapshot: Buffer): Promise<FaceCheckOutcome>` where
  `interface FaceCheckOutcome { verdict: FaceVerdict | 'skipped'; score: number | null; confirmed: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `apps/exam-runtime/src/face/face-verification.service.spec.ts`:

```ts
import { FaceVerificationService } from './face-verification.service';
import { encodeEmbedding } from '@exam-platform/shared';

const SAME = Float32Array.from([1, 0, 0]);
const OTHER = Float32Array.from([-1, 0, 0]);

function build(overrides: Record<string, unknown> = {}) {
  const enrolment = { embedding: `enc:${encodeEmbedding(SAME)}` };
  const tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn({
    faceEnrolment: { findUnique: jest.fn().mockResolvedValue(enrolment) },
    proctoringEvent: { create: jest.fn() },
    attempt: { update: jest.fn() },
  })) };
  const embedder = { isAvailable: () => true, embed: jest.fn().mockResolvedValue(SAME) };
  const crypto = { decrypt: (v: string) => v.replace(/^enc:/, '') };
  return new FaceVerificationService(
    tenantPrisma as never,
    { ...embedder, ...(overrides.embedder as object) } as never,
    crypto as never,
  );
}

describe('FaceVerificationService', () => {
  it('reports a match when the live face matches the reference', async () => {
    const outcome = await build().verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome.verdict).toBe('match');
    expect(outcome.confirmed).toBe(false);
  });

  // Skipped, not 'mismatch'. The feature going wrong must never look like the candidate
  // going wrong.
  it('skips when the model is unavailable', async () => {
    const service = build({ embedder: { isAvailable: () => false } });
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome.verdict).toBe('skipped');
    expect(outcome.score).toBeNull();
  });

  it('skips when the live frame could not be embedded', async () => {
    const service = build({ embedder: { embed: jest.fn().mockResolvedValue(null) } });
    expect((await service.verifySnapshot('a1', 'org-1', Buffer.from('img'))).verdict).toBe('skipped');
  });

  it('confirms only after the configured run of consecutive mismatches', async () => {
    const service = build({ embedder: { embed: jest.fn().mockResolvedValue(OTHER) } });
    expect((await service.verifySnapshot('a1', 'org-1', Buffer.from('i'))).confirmed).toBe(false);
    expect((await service.verifySnapshot('a1', 'org-1', Buffer.from('i'))).confirmed).toBe(false);
    expect((await service.verifySnapshot('a1', 'org-1', Buffer.from('i'))).confirmed).toBe(true);
  });

  it('keeps a separate run per attempt, so two candidates cannot combine into one accusation', async () => {
    const service = build({ embedder: { embed: jest.fn().mockResolvedValue(OTHER) } });
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a2', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect((await service.verifySnapshot('a2', 'org-1', Buffer.from('i'))).confirmed).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest face-verification`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create the service. It must:
- return `{ verdict: 'skipped', score: null, confirmed: false }` when the embedder is unavailable, when the attempt has no enrolment, when the enrolment has a null embedding, or when the live frame fails to embed;
- otherwise decrypt + decode the reference, embed the live frame, `cosineSimilarity`, `classifySimilarity`;
- feed the verdict to a **per-attempt** `createMismatchVoter` held in a `Map<string, MismatchVoter>` keyed by attemptId;
- on a confirmed mismatch, create a `face_mismatch` `ProctoringEvent` whose `metadataJson` carries `{ score, referenceImagePath, snapshotPath }`, and increment `Attempt.faceMismatchCount`;
- expose `forgetAttempt(attemptId: string): void` so the map does not grow without bound, called when an attempt settles.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest face-verification`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/face
git commit -m "feat(face-id): authoritative verification service with per-attempt confirmation"
```

---

### Task 8: Schema, per-exam action setting, and the enforcement ladder

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260812000000_face_mismatch/migration.sql`
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`, `apps/api/src/exams/exams.service.ts`, `apps/web/lib/types.ts`, the recruiter settings panel
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (snapshot path)
- Test: the corresponding `.spec` files

**Interfaces:**
- Produces: `Attempt.faceMismatchCount: Int @default(0)`, `Exam.faceMismatchAction: String @default("flag")`.

- [ ] **Step 1: Schema and migration**

Add to `model Attempt`:

```prisma
  faceMismatchCount             Int                 @default(0) @map("face_mismatch_count")
```

Add to `model Exam`:

```prisma
  faceMismatchAction            String        @default("flag") @map("face_mismatch_action")
```

Create `apps/api/prisma/migrations/20260812000000_face_mismatch/migration.sql`:

```sql
ALTER TABLE [dbo].[attempts] ADD [face_mismatch_count] INT NOT NULL CONSTRAINT [attempts_face_mismatch_count_df] DEFAULT 0;
ALTER TABLE [dbo].[exams] ADD [face_mismatch_action] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_face_mismatch_action_df] DEFAULT 'flag';
```

Apply with `npx prisma migrate deploy` (**not** `migrate dev` — this machine's SQL login cannot create the shadow database), then `npx prisma generate`.

- [ ] **Step 2: Write the failing DTO/service tests**

Add to `apps/api/src/exams/exams.service.spec.ts`:

```ts
    it('accepts a valid face mismatch action', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'exam-1' });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }), update }, attempt: { count: jest.fn().mockResolvedValue(0) } }),
      );

      await service.update(context, 'exam-1', { faceMismatchAction: 'warn' } as never, 'user-1');

      expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ faceMismatchAction: 'warn' }) }));
    });

    it('rejects an unknown action rather than storing it', async () => {
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }), update: jest.fn() }, attempt: { count: jest.fn().mockResolvedValue(0) } }),
      );

      await expect(service.update(context, 'exam-1', { faceMismatchAction: 'delete_candidate' } as never, 'user-1')).rejects.toThrow(/mismatch action/i);
    });
```

- [ ] **Step 3: Implement the DTO field**

In `create-exam.dto.ts`:

```ts
  @IsOptional() @IsIn(['flag', 'warn', 'pause', 'block'], {
    message: 'Face mismatch action must be flag, warn, pause or block',
  })
  faceMismatchAction?: string;
```

Thread it through `update()` and the response mapper exactly as `faceEnrolmentPolicy` already is.

- [ ] **Step 4: Wire verification into the snapshot path**

In `attempt.service.ts`'s webcam snapshot handler, after the snapshot is stored and **outside** any transaction, call `faceVerification.verifySnapshot(...)` when the exam has `faceVerificationEnabled`. On `confirmed === true`, branch on the exam's `faceMismatchAction`:

- `flag` — the event and the counter only. **No candidate-facing effect whatsoever.**
- `warn` — additionally surface the existing candidate warning path.
- `pause` / `block` — route through the same enforcement the webcam violations already use (`registerWebcamViolation`'s ladder), so pause/resume accounting, bypass, and recruiter unblock all keep working rather than being reimplemented.

Verification must be **fire-and-forget relative to the snapshot response** — a slow embed must never delay the candidate's request.

- [ ] **Step 5: Add the recruiter control**

In the settings panel beside "If the photo can't be captured", add **"If the face doesn't match"** with options `flag` / `warn` / `pause` / `block`, defaulting to `flag`. Render a visible note under it:

> Thresholds are not yet calibrated. Leave this on "Record only" until calibration and the fairness check are complete.

- [ ] **Step 6: Run everything**

```bash
cd "D:/exam-app-face-id/apps/api" && npx jest --maxWorkers=2 && npx tsc --noEmit
cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest --maxWorkers=2 && npx tsc --noEmit
cd "D:/exam-app-face-id/apps/web" && npx jest && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/api apps/exam-runtime apps/web
git commit -m "feat(face-id): per-exam mismatch action wired to the existing enforcement ladder"
```

---

### Task 9: Browser advisory tier — BUILT, THEN REMOVED BY DECISION (2026-08-12)

> **Do not rebuild this from the steps below.** It was implemented, reviewed and then deleted
> before merge. The final whole-branch review found it unreachable: the exam page calls
> `useWebcamMonitor` with four arguments, and — more fundamentally — **no endpoint ever returns a
> reference embedding to the browser**, so the tier could never run. Wiring it would mean handing
> a candidate's biometric template to the client, which is a design question this plan never
> settled. The user chose to remove it rather than ship ~260 lines and an `onnxruntime-web`
> dependency with no consumer.
>
> The **server** tier is authoritative and unaffected — it produces every verdict. If a browser
> tier is wanted later, it needs a design decision about how the reference reaches the client
> first, not a re-run of these steps.

**Files:**
- Create: `apps/web/lib/face-embedder.ts`
- Test: `apps/web/lib/face-embedder.test.ts`
- Modify: `apps/web/lib/hooks/useWebcamMonitor.ts`, `apps/web/package.json` (`onnxruntime-web`)

**Interfaces:**
- Produces: `createBrowserEmbedder(modelUrl: string): { embed(video: HTMLVideoElement): Promise<Float32Array | null>; close(): void }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/face-embedder.test.ts`:

```ts
import { createBrowserEmbedder } from './face-embedder';

describe('createBrowserEmbedder', () => {
  // The advisory tier is a convenience. If it cannot load, the candidate must see no difference
  // and the server tier must remain the thing that decides.
  it('returns null from embed() when the model cannot load, rather than throwing', async () => {
    const embedder = createBrowserEmbedder('https://example.invalid/missing.onnx');
    await expect(embedder.embed({ videoWidth: 0, videoHeight: 0 } as never)).resolves.toBeNull();
  });

  it('close() is safe to call before anything loaded', () => {
    expect(() => createBrowserEmbedder('https://example.invalid/missing.onnx').close()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "D:/exam-app-face-id/apps/web" && npx jest face-embedder`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`npm install onnxruntime-web --workspace=apps/web`. Implement the embedder: lazy `import('onnxruntime-web')`, session created from `NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL`, the same 112×112 RGB normalisation as the server (draw the video to a canvas, read `getImageData`). Every failure path returns `null`.

**Self-hosted only** — the model is served from the app's own origin like Monaco and MediaPipe. Candidates sit on networks that block third-party CDNs; this project has already been bitten by that twice.

- [ ] **Step 4: Wire it as advisory only**

In `useWebcamMonitor`, every ~4 seconds (**not** on the existing 500ms landmark loop — embedding is far more expensive), embed the current frame, compare against a reference the page holds, and use the result **only** to update a candidate-facing hint. It must not create events, must not call any enforcement path, and must not block the landmark loop.

- [ ] **Step 5: Run the tests**

Run: `cd "D:/exam-app-face-id/apps/web" && npx jest face-embedder useWebcamMonitor`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/face-embedder.ts apps/web/lib/face-embedder.test.ts apps/web/lib/hooks/useWebcamMonitor.ts apps/web/package.json package-lock.json
git commit -m "feat(face-id): browser advisory embedder for instant candidate feedback"
```

---

### Task 10: Side-by-side evidence on the candidate report

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts`, `apps/web/lib/types.ts`, `apps/web/components/CandidateReportPanel.tsx`
- Test: `apps/api/src/reports/reports.service.spec.ts`, `apps/web/components/CandidateReportPanel.test.tsx`

**Interfaces:**
- Produces: `CandidateDetail.faceMismatches: { occurredAt: string; score: number | null; snapshotUrl: string | null }[]`.

- [ ] **Step 1: Write the failing API test**

Add to `apps/api/src/reports/reports.service.spec.ts`:

```ts
    it('returns face mismatch events with SIGNED snapshot urls', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1', attemptId: 'a1', status: 'submitted' })]);
      blobStorage.signIfOurs = jest.fn().mockResolvedValue('https://blob/snap.jpg?sig=x');
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ sectionSnapshotJson: '[]', answers: [], faceEnrolment: null }) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([
          { eventType: 'face_mismatch', occurredAt: new Date('2026-08-12T09:00:00Z'), metadataJson: JSON.stringify({ score: 0.21, snapshotPath: 'https://blob/snap.jpg' }) },
        ]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.faceMismatches).toHaveLength(1);
      expect(detail.faceMismatches[0].score).toBeCloseTo(0.21);
      expect(detail.faceMismatches[0].snapshotUrl).toContain('sig=');
    });

    it('returns an empty list, not null, when there were no mismatches', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1', attemptId: 'a1', status: 'submitted' })]);
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ sectionSnapshotJson: '[]', answers: [], faceEnrolment: null }) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      expect((await service.getCandidateDetail(context, 'exam-1', 'cand-1')).faceMismatches).toEqual([]);
    });
```

- [ ] **Step 2: Run to verify failure, then implement**

Run: `cd "D:/exam-app-face-id/apps/api" && npx jest reports.service -t "face mismatch"` → FAIL.

Filter the attempt's proctoring events for `face_mismatch`, parse `metadataJson`, sign `snapshotPath` with `signIfOurs`, and return them ordered by `occurredAt`.

- [ ] **Step 3: Render the comparison**

In the existing "Face verification" card, when `faceMismatches` is non-empty render each one **beside the reference photo** — reference on the left, flagged snapshot on the right, with the score and timestamp underneath.

This is the piece that makes an automated accusation reviewable by a human, and it is the precondition the spec sets for offering `block` at all. Without it, `block` should be removed from the dropdown.

- [ ] **Step 4: Write the failing component test, implement, run**

Add a test asserting both images render with the score visible, and one asserting nothing extra renders when the list is empty. Then:

```bash
cd "D:/exam-app-face-id/apps/web" && npx jest CandidateReportPanel && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports apps/web/lib/types.ts apps/web/components/CandidateReportPanel.tsx apps/web/components/CandidateReportPanel.test.tsx
git commit -m "feat(face-id): side-by-side mismatch evidence on the candidate report"
```

---

### Task 11: Full verification

- [ ] **Step 1: Every suite and typecheck**

```bash
cd "D:/exam-app-face-id/packages/shared"   && npx jest && npx tsc --noEmit
cd "D:/exam-app-face-id/apps/api"          && npx jest --maxWorkers=2 && npx tsc --noEmit
cd "D:/exam-app-face-id/apps/exam-runtime" && npx jest --maxWorkers=2 && npx tsc --noEmit
cd "D:/exam-app-face-id/apps/web"          && npx jest && npx tsc --noEmit
```

- [ ] **Step 2: Confirm GDPR and retention already cover the embedding**

Stage 1 built both. **Verify, do not rebuild:** erase deletes the `FaceEnrolment` row (embedding included), and the retention job nulls `embedding` alongside `referenceImagePath`. Write a test asserting an erased candidate leaves no embedding behind if one does not already exist.

- [ ] **Step 3: Confirm the safe defaults**

Query a pre-existing exam and confirm `faceMismatchAction = 'flag'` and `faceVerificationEnabled = false`. **No existing exam may change behaviour on deploy.**

- [ ] **Step 4: Real-hardware pass**

With face verification enabled and the action on `flag`: enrol, then have a **different person** sit in front of the camera. Confirm a `face_mismatch` event appears with evidence on the report, and that the candidate experiences **nothing at all** — no warning, no pause. Then confirm the enrolled candidate returning produces no further events.

This is the check that proves the three-band logic and the voter work against real faces rather than fixtures. Do it before Task 12.

- [ ] **Step 5: Deploy**

All three apps, one migration, plus **model weights on the VM** — the first deploy to ship binary assets. Follow `memory/project_azure_deployment.md`: check for live attempts, back up, sync, `migrate status` before `migrate deploy`, detached build behind a done-marker. Set `FACE_EMBEDDING_MODEL_PATH` in `apps/exam-runtime/.env` and `NEXT_PUBLIC_FACE_EMBEDDING_MODEL_URL` in `apps/web/.env.local` — **both files are gitignored and VM-only**, so they must be set by hand and recorded in the deployment notes.

---

## Open items carried into stage 3

| # | Item | Why it blocks enforcement |
|---|---|---|
| 1 | Threshold calibration against a labelled fixture set | `PROVISIONAL_THRESHOLDS` are guesses; `warn`/`pause`/`block` act on them |
| 2 | `CONSECUTIVE_MISMATCHES_TO_CONFIRM` calibration | Trades detection speed against false accusations |
| 3 | Fairness check across skin tones and genders | The documented bias mitigation; result must be written down |
| 4 | Concurrency measurement on 2 vCPUs | Determines whether per-snapshot verification is viable at drive scale |
| 5 | Anti-spoofing (passive liveness + server model) | A photo of the *right* person matches perfectly; until this exists, `block` is defeatable |
