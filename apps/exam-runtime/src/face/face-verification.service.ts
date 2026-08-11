import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  TenantPrismaService,
  OrgSecretsCryptoService,
  cosineSimilarity,
  classifySimilarity,
  decodeEmbedding,
  FaceVerdict,
} from '@exam-platform/shared';
import { FaceEmbedderService } from './face-embedder.service';
import { createMismatchVoter, MismatchVoter } from './mismatch-voter';
import { getProctoringEventSeverity } from '../attempts/proctoring-severity';

export interface FaceCheckOutcome {
  verdict: FaceVerdict | 'skipped';
  score: number | null;
  confirmed: boolean;
}

// Shared and returned from six paths below, so it must never be mutated by a caller --
// Object.freeze turns an accidental write into a thrown TypeError instead of silently
// poisoning every future skip.
const SKIPPED: Readonly<FaceCheckOutcome> = Object.freeze({ verdict: 'skipped', score: null, confirmed: false });

// The single place a face verdict is produced. Flagging, warning, pausing, blocking -- every
// downstream consequence trusts what this returns, so every failure mode here degrades to
// 'skipped', never 'mismatch': the feature breaking must never look like the candidate
// cheating (see the stage-2 brief, constraint #1).
@Injectable()
export class FaceVerificationService {
  private readonly logger = new Logger(FaceVerificationService.name);

  // Per-attempt mismatch-run state. Keyed by attemptId so two candidates' runs can never
  // combine into one accusation -- see forgetAttempt().
  private readonly voters = new Map<string, MismatchVoter>();

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly faceEmbedder: FaceEmbedderService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  async verifySnapshot(
    attemptId: string,
    organizationId: string,
    snapshot: Buffer,
    snapshotPath?: string | null,
  ): Promise<FaceCheckOutcome> {
    if (!this.faceEmbedder.isAvailable()) return this.skip(attemptId);

    // Read-only, inside the transaction (RLS needs the session context set -- see
    // TenantPrismaService.forTenant). Everything that actually does work -- decrypt, decode,
    // embed -- happens after this resolves and outside any transaction: nesting it inside a
    // forTenant callback would hold a pooled connection open for the whole inference call
    // (ADO #6810). Mirrors recordFaceEnrolment's ordering in attempt.service.ts.
    const fetchEnrolment = () =>
      this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.faceEnrolment.findUnique({ where: { attemptId }, select: { embedding: true, referenceImagePath: true } }),
      );
    let enrolment: Awaited<ReturnType<typeof fetchEnrolment>>;
    try {
      enrolment = await fetchEnrolment();
    } catch (error) {
      // A pool timeout or dropped connection is a broken database, not evidence about the
      // candidate on camera -- degrade the same as every other failure mode here.
      this.logger.warn(`Face enrolment read failed for attempt ${attemptId}: ${String(error)}`);
      return this.skip(attemptId);
    }
    if (!enrolment?.embedding) return this.skip(attemptId);

    let reference: Float32Array;
    try {
      // decrypt() throws on a bad key or tampered ciphertext; decodeEmbedding() throws on a
      // corrupt stored value. Neither is evidence about the candidate on camera.
      reference = decodeEmbedding(this.crypto.decrypt(enrolment.embedding));
    } catch (error) {
      this.logger.warn(`Face reference unreadable for attempt ${attemptId}: ${String(error)}`);
      return this.skip(attemptId);
    }

    const live = await this.faceEmbedder.embed(snapshot);
    if (!live) return this.skip(attemptId);

    let score: number;
    try {
      // Throws on a dimension mismatch (e.g. the embedding model changed between enrolment and
      // now) -- a broken comparison, not a mismatched face.
      score = cosineSimilarity(reference, live);
    } catch (error) {
      this.logger.warn(`Face similarity failed for attempt ${attemptId}: ${String(error)}`);
      return this.skip(attemptId);
    }

    const verdict = classifySimilarity(score);
    let confirmed = this.voterFor(attemptId).push(verdict);

    if (confirmed) {
      try {
        await this.recordConfirmedMismatch(
          organizationId,
          attemptId,
          score,
          snapshotPath ?? null,
          enrolment.referenceImagePath ?? null,
        );
      } catch (error) {
        // The event was never persisted, so the latch must not stand either -- leaving `fired`
        // true would lose this cheating episode forever, since no later mismatch in the run
        // could re-confirm it. Reset so the next mismatch starts a fresh, re-confirmable run.
        this.logger.warn(`Failed to record confirmed face mismatch for attempt ${attemptId}: ${String(error)}`);
        this.voterFor(attemptId).reset();
        // Nothing was persisted, so callers must not act on this. Pausing or blocking a candidate
        // on an episode with no stored event would leave a recruiter reviewing an accusation with
        // no evidence behind it. The reset above means a real mismatch re-confirms on a later frame.
        confirmed = false;
      }
    }

    return { verdict, score, confirmed };
  }

  /**
   * Drop an attempt's voter once it settles, so the map does not grow without bound.
   * ponytail: not wired up yet -- that belongs to the next task, which must call this on
   * attempt settle/submit. Until then `voters` gains one entry per attempt for the process
   * lifetime.
   */
  forgetAttempt(attemptId: string): void {
    this.voters.delete(attemptId);
  }

  // A run interrupted by ignorance is not a run -- mismatch-voter.ts's own rule for 'uncertain'
  // verdicts applies just as much to a skip: if a voter already exists for this attempt, reset
  // it, or an unrelated skip (model briefly unavailable, a corrupt frame) could bridge two
  // otherwise-unconnected mismatches into a false confirmation.
  private skip(attemptId: string): Readonly<FaceCheckOutcome> {
    this.voters.get(attemptId)?.reset();
    return SKIPPED;
  }

  private voterFor(attemptId: string): MismatchVoter {
    let voter = this.voters.get(attemptId);
    if (!voter) {
      voter = createMismatchVoter();
      this.voters.set(attemptId, voter);
    }
    return voter;
  }

  private async recordConfirmedMismatch(
    organizationId: string,
    attemptId: string,
    score: number,
    snapshotPath: string | null,
    referenceImagePath: string | null,
  ): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.proctoringEvent.create({
          data: {
            attemptId,
            eventType: 'face_mismatch',
            severity: getProctoringEventSeverity('face_mismatch'),
            metadataJson: JSON.stringify({ score, referenceImagePath, snapshotPath }),
          },
        }),
        tx.attempt.update({
          where: { id: attemptId },
          // ponytail: Attempt.faceMismatchCount lands in stage-2's schema/migration task, not
          // yet applied to this generated Prisma client. Cast through unknown until `npx prisma
          // generate` picks up the new column, then drop the cast.
          data: { faceMismatchCount: { increment: 1 } } as unknown as Prisma.AttemptUpdateInput,
        }),
      ]),
    );
  }
}
