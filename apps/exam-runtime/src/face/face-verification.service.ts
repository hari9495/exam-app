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

const SKIPPED: FaceCheckOutcome = { verdict: 'skipped', score: null, confirmed: false };

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

  async verifySnapshot(attemptId: string, organizationId: string, snapshot: Buffer): Promise<FaceCheckOutcome> {
    if (!this.faceEmbedder.isAvailable()) return SKIPPED;

    // Read-only, inside the transaction (RLS needs the session context set -- see
    // TenantPrismaService.forTenant). Everything that actually does work -- decrypt, decode,
    // embed -- happens after this resolves and outside any transaction: nesting it inside a
    // forTenant callback would hold a pooled connection open for the whole inference call
    // (ADO #6810). Mirrors recordFaceEnrolment's ordering in attempt.service.ts.
    const enrolment = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.faceEnrolment.findUnique({ where: { attemptId }, select: { embedding: true, referenceImagePath: true } }),
    );
    if (!enrolment?.embedding) return SKIPPED;

    let reference: Float32Array;
    try {
      // decrypt() throws on a bad key or tampered ciphertext; decodeEmbedding() throws on a
      // corrupt stored value. Neither is evidence about the candidate on camera.
      reference = decodeEmbedding(this.crypto.decrypt(enrolment.embedding));
    } catch (error) {
      this.logger.warn(`Face reference unreadable for attempt ${attemptId}: ${String(error)}`);
      return SKIPPED;
    }

    const live = await this.faceEmbedder.embed(snapshot);
    if (!live) return SKIPPED;

    let score: number;
    try {
      // Throws on a dimension mismatch (e.g. the embedding model changed between enrolment and
      // now) -- a broken comparison, not a mismatched face.
      score = cosineSimilarity(reference, live);
    } catch (error) {
      this.logger.warn(`Face similarity failed for attempt ${attemptId}: ${String(error)}`);
      return SKIPPED;
    }

    const verdict = classifySimilarity(score);
    const confirmed = this.voterFor(attemptId).push(verdict);

    if (confirmed) {
      await this.recordConfirmedMismatch(organizationId, attemptId, score, enrolment.referenceImagePath ?? null);
    }

    return { verdict, score, confirmed };
  }

  /** Drop an attempt's voter once it settles, so the map does not grow without bound. */
  forgetAttempt(attemptId: string): void {
    this.voters.delete(attemptId);
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
    referenceImagePath: string | null,
  ): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.proctoringEvent.create({
          data: {
            attemptId,
            eventType: 'face_mismatch',
            severity: getProctoringEventSeverity('face_mismatch'),
            // snapshotPath is null here: verifySnapshot receives only image bytes, not the
            // uploaded blob's path. The caller wiring this into the live snapshot pipeline
            // (a later task) has that path and can thread it through then.
            metadataJson: JSON.stringify({ score, referenceImagePath, snapshotPath: null }),
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
