import { Logger } from '@nestjs/common';
import { FaceVerificationService } from './face-verification.service';
import { encodeEmbedding } from '@exam-platform/shared';
import { __resetFaceVerificationStateForTests } from './face-verification-state';

// The per-attempt state moved to module scope (finding 2, this task) so both Nest app
// containers share it -- but that also means every `new FaceVerificationService(...)` built
// below now reads and writes the SAME maps, and most tests below reuse attempt id 'a1'. Without
// this reset, a later test would see voter/warning state left behind by an earlier one.
beforeEach(() => {
  __resetFaceVerificationStateForTests();
});

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

// Builds a service whose enrolment row, embedder and crypto can each be overridden
// independently -- used for the skip-path and instrumentation tests below, which need
// combinations `build()` above doesn't support (e.g. a null enrolment, a throwing decrypt).
function buildWith(opts: {
  enrolment?: unknown;
  embedder?: Partial<{ isAvailable: () => boolean; embed: jest.Mock }>;
  decrypt?: (v: string) => string;
  tx?: { faceEnrolment: unknown; proctoringEvent: unknown; attempt: unknown };
  tenantPrismaSpy?: { forTenant: jest.Mock };
} = {}) {
  const tx = opts.tx ?? {
    faceEnrolment: { findUnique: jest.fn().mockResolvedValue(opts.enrolment) },
    proctoringEvent: { create: jest.fn() },
    attempt: { update: jest.fn() },
  };
  const tenantPrisma = opts.tenantPrismaSpy ?? { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
  const embedder = { isAvailable: () => true, embed: jest.fn().mockResolvedValue(SAME), ...opts.embedder };
  const crypto = { decrypt: opts.decrypt ?? ((v: string) => v.replace(/^enc:/, '')) };
  const service = new FaceVerificationService(tenantPrisma as never, embedder as never, crypto as never);
  return { service, tx, tenantPrisma, embedder, crypto };
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

  // Item 4 (task-8): a model missing in production must not be silently indistinguishable from
  // "no mismatches ever occurred" -- but must also not spam a log line every 120-180s per
  // candidate for the whole exam, which is what a per-snapshot log would do.
  it('warns once per attempt, not once per snapshot, when the embedding model is unavailable', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = build({ embedder: { isAvailable: () => false } });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('warns again for a different attempt, since each attempt gets its own one-time warning', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = build({ embedder: { isAvailable: () => false } });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    await service.verifySnapshot('a2', 'org-1', Buffer.from('img'));

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('warns again after forgetAttempt, since the one-time warning is cleared along with the voter', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = build({ embedder: { isAvailable: () => false } });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    service.forgetAttempt('a1');
    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
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

  // A single shared voter (instead of one per attempt) would still pass a weaker version of this
  // test: pushing a1,a2,a1,a2 confirms on the 3rd push regardless of which attempt it belongs to,
  // and the 4th push returns false either way -- the latch masks the bug. Interleaving a1,a2,a1,
  // a2,a1 and asserting on every intermediate result forces a1's confirmation to land exactly on
  // its own 3rd mismatch, which a global voter gets wrong (see task-7-report.md for the mutation
  // that proves it).
  it('keeps a separate run per attempt, so two candidates cannot combine into one accusation', async () => {
    const service = build({ embedder: { embed: jest.fn().mockResolvedValue(OTHER) } });
    const a1First = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    const a2First = await service.verifySnapshot('a2', 'org-1', Buffer.from('i'));
    const a1Second = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    const a2Second = await service.verifySnapshot('a2', 'org-1', Buffer.from('i'));
    const a1Third = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));

    expect(a1First.confirmed).toBe(false);
    expect(a2First.confirmed).toBe(false);
    expect(a1Second.confirmed).toBe(false);
    expect(a2Second.confirmed).toBe(false);
    expect(a1Third.confirmed).toBe(true);
    expect(a2Second.confirmed).toBe(false);
  });

  // --- Additional skip-path coverage (constraint #1: uncertainty is never an accusation). ---
  // Each of these must land on 'skipped', never 'mismatch' -- a candidate must never be
  // accused because the *feature* broke.

  it('skips when the attempt has no enrolment row', async () => {
    const { service } = buildWith({ enrolment: null });
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome).toEqual({ verdict: 'skipped', score: null, confirmed: false });
  });

  // Finding 3 (task-8): the model-unavailable branch above already warns once per attempt so a
  // silently-inert deployment shows up in logs -- but if the model loads fine and enrolment
  // embeddings simply never got written (an encrypt failure at enrolment, or a stalled backfill),
  // verification was *also* silently inert forever, with zero logs, which is exactly the case
  // this whole warning mechanism exists to catch.
  it('warns once per attempt, with a message distinct from the model-unavailable one, when the enrolment row has no embedding', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = buildWith({ enrolment: null });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [message] = warnSpy.mock.calls[0];
    expect(message).toContain('a1');
    expect(message).not.toContain('embedding model is unavailable');
    warnSpy.mockRestore();
  });

  it('warns again after forgetAttempt for the missing-embedding case too', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { service } = buildWith({ enrolment: null });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    service.forgetAttempt('a1');
    await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('skips when the enrolment row has a null embedding', async () => {
    const { service } = buildWith({ enrolment: { embedding: null } });
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome).toEqual({ verdict: 'skipped', score: null, confirmed: false });
  });

  it('skips when the stored reference cannot be decrypted (bad key or tampered ciphertext)', async () => {
    const { service } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      decrypt: () => {
        throw new Error('bad key');
      },
    });
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome).toEqual({ verdict: 'skipped', score: null, confirmed: false });
  });

  it('skips when the stored reference embedding is corrupt and will not decode', async () => {
    const { service } = buildWith({ enrolment: { embedding: 'enc:not-valid-base64!!!' } });
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome).toEqual({ verdict: 'skipped', score: null, confirmed: false });
  });

  it('skips when the reference and live embeddings have mismatched dimensions', async () => {
    const { service } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      embedder: { embed: jest.fn().mockResolvedValue(Float32Array.from([1, 0])) },
    });
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome).toEqual({ verdict: 'skipped', score: null, confirmed: false });
  });

  // --- Confirmed-mismatch side effects ---

  it('records a face_mismatch event and increments the attempt count only once, on confirmation', async () => {
    const { service, tx } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}`, referenceImagePath: '/ref.jpg' },
      embedder: { embed: jest.fn().mockResolvedValue(OTHER) },
    });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect((tx.proctoringEvent as { create: jest.Mock }).create).not.toHaveBeenCalled();
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));

    expect(outcome.confirmed).toBe(true);
    const create = (tx.proctoringEvent as { create: jest.Mock }).create;
    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0][0];
    expect(call.data.attemptId).toBe('a1');
    expect(call.data.eventType).toBe('face_mismatch');
    // Pins the map->row wiring, not just the map: a recruiter triaging by severity must not see
    // the strongest signal in the system ranked alongside a right-click.
    expect(call.data.severity).toBe('high');
    expect(JSON.parse(call.data.metadataJson)).toEqual({
      score: outcome.score,
      referenceImagePath: '/ref.jpg',
      snapshotPath: null,
    });
    expect((tx.attempt as { update: jest.Mock }).update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { faceMismatchCount: { increment: 1 } },
    });
  });

  // --- forgetAttempt ---

  it('forgetAttempt drops the per-attempt voter so a stale run cannot combine with a new one', async () => {
    const { service } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      embedder: { embed: jest.fn().mockResolvedValue(OTHER) },
    });
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    service.forgetAttempt('a1');
    // Without forgetAttempt this would be the 3rd consecutive mismatch and would confirm.
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(outcome.confirmed).toBe(false);
  });

  // Finding 2: main.ts boots two separate Nest app containers in one process (the public app and
  // the internal/recruiter app), and FaceModule is reachable from both -- so Nest constructs two
  // independent FaceVerificationService instances. AttemptSettlementService.finalize() calls
  // forgetAttempt() under whichever app handled the request; if a voter registered through one
  // instance were invisible to the other, forgetAttempt() from the internal app's force-submit
  // path would clear an always-empty map while the public app's real entry leaked forever. Two
  // `new FaceVerificationService(...)` calls stand in for the two DI containers here -- no Nest
  // TestingModule needed to prove the underlying maps are the same object.
  it('shares per-attempt voter state across separate instances, since two Nest app containers each construct their own', async () => {
    const { service: instanceA } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      embedder: { embed: jest.fn().mockResolvedValue(OTHER) },
    });
    const { service: instanceB } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      embedder: { embed: jest.fn().mockResolvedValue(OTHER) },
    });

    // Two mismatches registered through instance A (stands in for the public app).
    await instanceA.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await instanceA.verifySnapshot('a1', 'org-1', Buffer.from('i'));

    // forgetAttempt called through instance B (stands in for the internal app's force-submit
    // path). If the two instances had separate maps, this would be a no-op against an
    // already-empty one, and instance A's run would still be live.
    instanceB.forgetAttempt('a1');

    // Proof: a fresh mismatch through instance A starts a new run at 1, not continuing the old
    // run at 3 -- so it must NOT confirm. Before the fix (separate instance-level maps), B's
    // forgetAttempt would not have reached A's voter, and this would be the 3rd consecutive
    // mismatch, confirming.
    const outcome = await instanceA.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(outcome.confirmed).toBe(false);
  });

  // --- Connection-pool-starvation ordering (ADO #6810) ---
  // Decrypt and embed must run strictly outside every forTenant transaction -- never nested
  // inside the read OR the write callback -- or a slow inference call holds a pooled connection
  // open for its whole duration.
  //
  // A call-order assertion (comparing jest.fn().mock.invocationCallOrder for forTenant against
  // decrypt/embed) looks right but is vacuous: invocationCallOrder records when forTenant is
  // *called*, before its callback body runs. Work done inside the callback and work done after
  // forTenant resolves both produce "decrypt ran after forTenant was called" -- see
  // task-7-report.md for the mutation that proves it. A re-entrancy flag catches both shapes:
  // it's true only while a forTenant callback is actually executing.
  //
  // Note WHICH assertion fails when nesting is introduced: verifySnapshot catches everything
  // decrypt and embed throw, so the insideTx expectations below get swallowed and turned into a
  // skip. The call COUNTS are the actual failure channel -- do not trim them as redundant, they
  // are what makes this test bite.
  it('runs decrypt and embed strictly outside every forTenant transaction', async () => {
    const tx = {
      faceEnrolment: { findUnique: jest.fn().mockResolvedValue({ embedding: `enc:${encodeEmbedding(SAME)}`, referenceImagePath: '/ref.jpg' }) },
      proctoringEvent: { create: jest.fn() },
      attempt: { update: jest.fn() },
    };
    let insideTx = false;
    const forTenant = jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => {
      insideTx = true;
      try {
        return await fn(tx);
      } finally {
        insideTx = false;
      }
    });
    const tenantPrismaSpy = { forTenant };
    const decrypt = jest.fn((v: string) => {
      expect(insideTx).toBe(false);
      return v.replace(/^enc:/, '');
    });
    const embed = jest.fn(async () => {
      expect(insideTx).toBe(false);
      return OTHER;
    });
    const { service } = buildWith({ tx, tenantPrismaSpy, decrypt, embedder: { embed } });

    // Three consecutive mismatches so a confirmed write transaction actually happens --
    // otherwise forTenant is only ever called for the read.
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));

    expect(forTenant).toHaveBeenCalledTimes(4); // 3 reads + 1 confirmed write
    expect(decrypt).toHaveBeenCalledTimes(3);
    expect(embed).toHaveBeenCalledTimes(3);
  });

  // --- verifySnapshot never rejects (constraint #1: a broken feature is not evidence) ---

  it('resolves to the skipped outcome, never rejects, when the read transaction fails', async () => {
    const tenantPrismaSpy = { forTenant: jest.fn().mockRejectedValue(new Error('pool timeout')) };
    const { service } = buildWith({ tenantPrismaSpy });

    await expect(service.verifySnapshot('a1', 'org-1', Buffer.from('img'))).resolves.toEqual({
      verdict: 'skipped',
      score: null,
      confirmed: false,
    });
  });

  // --- Finding 4: the voter must not latch when the confirming write fails ---

  it('resolves without rejecting, and resets the voter so a later mismatch can re-confirm, when persisting a confirmed mismatch fails', async () => {
    const tx = {
      faceEnrolment: { findUnique: jest.fn().mockResolvedValue({ embedding: `enc:${encodeEmbedding(SAME)}` }) },
      proctoringEvent: {
        create: jest.fn(() => {
          throw new Error('write failed');
        }),
      },
      attempt: { update: jest.fn() },
    };
    const { service } = buildWith({
      tx,
      embedder: { embed: jest.fn().mockResolvedValue(OTHER) },
    });

    const first = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    const second = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    const third = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(first.confirmed).toBe(false);
    expect(second.confirmed).toBe(false);
    // The voter fired, but nothing was persisted -- so the caller must NOT be told it was
    // confirmed. Acting on this would pause or block a candidate over an episode a recruiter
    // could never review, because no event exists to review.
    expect(third.confirmed).toBe(false);
    expect(tx.proctoringEvent.create).toHaveBeenCalledTimes(1);

    // Without a reset, the voter would still be latched (fired=true) and neither of these two
    // further mismatches could ever confirm again -- the episode would be lost for good.
    const fourth = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    const fifth = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(fourth.confirmed).toBe(false);
    expect(fifth.confirmed).toBe(false);
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    // A second write ATTEMPT is the observable proof the voter re-armed. It reports unconfirmed
    // again only because this write fails too; against a healthy database it would confirm.
    expect(tx.proctoringEvent.create).toHaveBeenCalledTimes(2);
  });

  it('reports confirmed once the persisting write succeeds', async () => {
    const tx = {
      faceEnrolment: { findUnique: jest.fn().mockResolvedValue({ embedding: `enc:${encodeEmbedding(SAME)}` }) },
      proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
      attempt: { update: jest.fn() },
    };
    const { service } = buildWith({ tx, embedder: { embed: jest.fn().mockResolvedValue(OTHER) } });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    const third = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(third.confirmed).toBe(true);
  });

  // --- Finding 2: an 'uncertain' verdict must reach the caller as-is, never as 'mismatch' ---

  it('classifies an ambiguous frame as uncertain end-to-end, and an uncertain frame breaks a mismatch run rather than confirming it', async () => {
    // reference (1,0,0) vs live (1,1.73,0): cosine = 1/sqrt(1+1.73^2) ~= 0.5003, inside the
    // provisional [0.4, 0.6) band -- neither a confident match nor a confident mismatch.
    const AMBIGUOUS = Float32Array.from([1, 1.73, 0]);
    const { service } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      embedder: {
        embed: jest
          .fn()
          .mockResolvedValueOnce(OTHER) // mismatch
          .mockResolvedValueOnce(AMBIGUOUS) // uncertain -- breaks the run
          .mockResolvedValueOnce(OTHER) // mismatch (run restarts at 1)
          .mockResolvedValueOnce(OTHER), // mismatch (run=2, still short of 3)
      },
    });

    const first = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(first.verdict).toBe('mismatch');
    const second = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(second.verdict).toBe('uncertain');
    expect(second.confirmed).toBe(false);
    const third = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(third.verdict).toBe('mismatch');
    expect(third.confirmed).toBe(false);
    const fourth = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(fourth.verdict).toBe('mismatch');
    expect(fourth.confirmed).toBe(false);
  });

  // --- Finding 8: a skip must break a mismatch run the same way 'uncertain' does ---

  it('breaks a mismatch run when an intervening frame is skipped, so an unrelated outage cannot bridge two mismatches into a false confirmation', async () => {
    const { service } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      embedder: {
        embed: jest
          .fn()
          .mockResolvedValueOnce(OTHER) // mismatch (run=1)
          .mockResolvedValueOnce(null) // skipped -- model briefly unavailable for this frame
          .mockResolvedValueOnce(OTHER) // mismatch (run should restart at 1)
          .mockResolvedValueOnce(OTHER), // mismatch (run=2, still short of 3)
      },
    });

    const first = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(first.verdict).toBe('mismatch');
    const second = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(second.verdict).toBe('skipped');
    const third = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(third.confirmed).toBe(false);
    const fourth = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    expect(fourth.confirmed).toBe(false); // only 2 consecutive mismatches -- the skip broke the run
  });

  // --- Finding 6: the caller-supplied snapshotPath must reach metadataJson ---

  it('threads a supplied snapshotPath into the recorded event metadata', async () => {
    const { service, tx } = buildWith({
      enrolment: { embedding: `enc:${encodeEmbedding(SAME)}` },
      embedder: { embed: jest.fn().mockResolvedValue(OTHER) },
    });

    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'), '/snapshots/a1-3.jpg');
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'), '/snapshots/a1-3.jpg');
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('i'), '/snapshots/a1-3.jpg');

    expect(outcome.confirmed).toBe(true);
    const create = (tx.proctoringEvent as { create: jest.Mock }).create;
    expect(JSON.parse(create.mock.calls[0][0].data.metadataJson)).toMatchObject({
      snapshotPath: '/snapshots/a1-3.jpg',
    });
  });
});
