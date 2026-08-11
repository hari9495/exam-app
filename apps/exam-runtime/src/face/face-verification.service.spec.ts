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

  // --- Additional skip-path coverage (constraint #1: uncertainty is never an accusation). ---
  // Each of these must land on 'skipped', never 'mismatch' -- a candidate must never be
  // accused because the *feature* broke.

  it('skips when the attempt has no enrolment row', async () => {
    const { service } = buildWith({ enrolment: null });
    const outcome = await service.verifySnapshot('a1', 'org-1', Buffer.from('img'));
    expect(outcome).toEqual({ verdict: 'skipped', score: null, confirmed: false });
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

  // --- Connection-pool-starvation ordering (ADO #6810) ---
  // Decrypt and embed must run strictly between the read transaction and the (confirmed-only)
  // write transaction -- never nested inside either -- or a slow inference call holds a pooled
  // connection open for its whole duration. Mirrors the idiom in
  // attempt.service.spec.ts's "runs embedding strictly outside the upsert transaction" test.
  it('runs decrypt and embed strictly outside every forTenant transaction', async () => {
    const tx = {
      faceEnrolment: { findUnique: jest.fn().mockResolvedValue({ embedding: `enc:${encodeEmbedding(SAME)}`, referenceImagePath: '/ref.jpg' }) },
      proctoringEvent: { create: jest.fn() },
      attempt: { update: jest.fn() },
    };
    const tenantPrismaSpy = { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    const decrypt = jest.fn((v: string) => v.replace(/^enc:/, ''));
    const embed = jest.fn().mockResolvedValue(OTHER);
    const { service } = buildWith({ tx, tenantPrismaSpy, decrypt, embedder: { embed } });

    // Three consecutive mismatches so a confirmed write transaction actually happens --
    // otherwise forTenant is only ever called for the read and there's nothing to order against.
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));
    await service.verifySnapshot('a1', 'org-1', Buffer.from('i'));

    expect(tenantPrismaSpy.forTenant).toHaveBeenCalledTimes(4); // 3 reads + 1 confirmed write
    const thirdReadOrder = tenantPrismaSpy.forTenant.mock.invocationCallOrder[2];
    const writeOrder = tenantPrismaSpy.forTenant.mock.invocationCallOrder[3];
    const lastDecryptOrder = decrypt.mock.invocationCallOrder[decrypt.mock.invocationCallOrder.length - 1];
    const lastEmbedOrder = embed.mock.invocationCallOrder[embed.mock.invocationCallOrder.length - 1];

    expect(lastDecryptOrder).toBeGreaterThan(thirdReadOrder);
    expect(lastDecryptOrder).toBeLessThan(writeOrder);
    expect(lastEmbedOrder).toBeGreaterThan(thirdReadOrder);
    expect(lastEmbedOrder).toBeLessThan(writeOrder);
  });
});
