import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { IntegrityNarrativeClient } from './integrity-narrative.client';
import { deriveTelemetryFlags, deriveAttemptFlags, deriveLevel, IntegrityFlag, AnswerTelemetry } from './integrity-rules';
import { normalizeCode, similarityScore, MIN_NORMALIZED_LENGTH, SIMILARITY_THRESHOLD, SIMILARITY_HIGH } from './similarity';
import { resolveProctoringConfig } from '../attempts/proctoring-config';

const CLEAR_NARRATIVE = 'No integrity concerns detected.';
const COUNTERPART_STATUSES = ['submitted', 'auto_submitted', 'force_submitted', 'pending_manual_grade'];

interface SimilarityMatch {
  questionId: string;
  counterpartAttemptId: string;
  similarity: number;
}

function similarityDetail(similarity: number): string {
  return `Code is ${Math.round(similarity * 100)}% similar to another candidate's submission for this question`;
}

@Injectable()
export class IntegrityAnalysisService {
  private readonly logger = new Logger(IntegrityAnalysisService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly integrityNarrativeClient: IntegrityNarrativeClient,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}

  async analyze(attemptId: string): Promise<void> {
    try {
      const attempt = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.attempt.findUnique({
          where: { id: attemptId },
          include: { invitation: { include: { exam: true } } },
        }),
      );
      if (!attempt) {
        this.logger.warn(`Attempt ${attemptId} not found, skipping integrity analysis`);
        return;
      }

      const organizationId = attempt.invitation.exam.organizationId;
      const examId = attempt.examId;
      const examTitle = attempt.invitation.exam.title;

      const { answers, events, similarityMatches } = await this.tenantPrisma.forTenant(
        { organizationId, isSuperAdmin: false },
        async (tx) => {
          const answers = await tx.answer.findMany({
            where: { attemptId },
            include: { question: { select: { id: true, type: true, marks: true } } },
          });
          const events = await tx.proctoringEvent.findMany({ where: { attemptId } });

          const similarityMatches: SimilarityMatch[] = [];
          for (const answer of answers) {
            if (answer.question.type !== 'code' || !answer.answerText) continue;
            if (normalizeCode(answer.answerText).length < MIN_NORMALIZED_LENGTH) continue;

            const counterparts = await tx.answer.findMany({
              where: {
                questionId: answer.question.id,
                attempt: { examId, status: { in: COUNTERPART_STATUSES }, id: { not: attemptId } },
                answerText: { not: null },
              },
              include: { attempt: { select: { id: true } } },
            });

            for (const counterpart of counterparts) {
              const score = similarityScore(answer.answerText, counterpart.answerText as string);
              if (score >= SIMILARITY_THRESHOLD) {
                similarityMatches.push({
                  questionId: answer.question.id,
                  counterpartAttemptId: counterpart.attempt.id,
                  similarity: Math.round(score * 100) / 100,
                });
              }
            }
          }

          return { answers, events, similarityMatches };
        },
      );

      const flags: IntegrityFlag[] = [];

      for (const answer of answers) {
        if (answer.question.type !== 'code' || !answer.telemetryJson) continue;
        let telemetry: AnswerTelemetry;
        try {
          telemetry = JSON.parse(answer.telemetryJson);
        } catch {
          continue;
        }
        flags.push(
          ...deriveTelemetryFlags({
            questionId: answer.question.id,
            telemetry,
            finalCodeLength: (answer.answerText ?? '').length,
            scoredFullMarks: answer.marksAwarded !== null && answer.marksAwarded >= answer.question.marks,
          }),
        );
      }

      // Blocked must reflect the exam's actual configured limit/enforcement, not a
      // hardcoded threshold or attempt.status -- by the time integrity analysis runs
      // (from finalize) status is already submitted/auto_submitted, so it no longer
      // carries the block information.
      const proctoring = resolveProctoringConfig(attempt.invitation.exam, attempt);
      flags.push(
        ...deriveAttemptFlags({
          webcamViolationCount: attempt.webcamViolationCount,
          blocked:
            proctoring.enforcement === 'block' &&
            !proctoring.webcamRecordOnly &&
            attempt.webcamViolationCount >= proctoring.strikeLimit,
          events,
        }),
      );

      for (const match of similarityMatches) {
        flags.push({
          type: 'similarity_match',
          severity: match.similarity >= SIMILARITY_HIGH ? 'high' : 'medium',
          detail: similarityDetail(match.similarity),
          questionId: match.questionId,
          counterpartAttemptId: match.counterpartAttemptId,
          similarity: match.similarity,
        });
      }

      const level = deriveLevel(flags);

      let narrative: string | null;
      let narrativeSucceeded = false;
      if (flags.length === 0) {
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

      const disclosure = this.bypassDisclosure(attempt);
      if (disclosure) {
        narrative = narrative ? `${disclosure}\n\n${narrative}` : disclosure;
      }

      const result = { status: 'completed', level, flagsJson: JSON.stringify(flags), narrative };
      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
        await tx.integrityAnalysis.upsert({
          where: { attemptId },
          create: { attemptId, ...result },
          update: { ...result, analyzedAt: new Date() },
        });
        if (narrativeSucceeded) {
          await tx.aiCreditUsage.create({
            data: { organizationId, source: 'integrity_narrative', credits: 1, sourceId: attemptId },
          });
        }
      });

      if (similarityMatches.length > 0) {
        await this.updateCounterparts(organizationId, attemptId, similarityMatches);
      }
    } catch (error) {
      this.logger.error(`Integrity analysis could not run for attempt ${attemptId}`, error as Error);
    }
  }

  // The disclosure belongs in the narrative, not in flagsJson: IntegrityFlag severity
  // is only 'medium' | 'high', so a bypass flag would push an otherwise-clean attempt
  // to 'review' and penalise a candidate for a fault the recruiter accommodated.
  //
  // It fires on a revoked bypass too: revoking resets both violation counters, so
  // without a durable disclosure a bypassed-then-revoked attempt would read quieter
  // than the same attempt with no bypass at all.
  private bypassDisclosure(attempt: {
    proctoringBypassedAt: Date | null;
    proctoringBypassReason: string | null;
    proctoringBypassRevokedAt: Date | null;
  }): string | null {
    if (!attempt.proctoringBypassedAt) {
      return null;
    }
    const when = attempt.proctoringBypassedAt.toISOString();
    const reason = attempt.proctoringBypassReason?.trim() || 'no reason recorded';
    const window = attempt.proctoringBypassRevokedAt
      ? `from ${when} until ${attempt.proctoringBypassRevokedAt.toISOString()}`
      : `from ${when} for the remainder of the attempt`;
    // "Recruiter note: " prefix so the reader can tell this sentence is not AI-authored
    // narrative — the report renders narrative and disclosure as one paragraph.
    return `Recruiter note: proctoring enforcement was relaxed by a recruiter ${window} (reason: ${reason}). Violations during that window were recorded but not acted on, so the absence of a pause or block does not imply the absence of violations.`;
  }

  private async updateCounterparts(organizationId: string, attemptId: string, matches: SimilarityMatch[]): Promise<void> {
    try {
      const matchesByCounterpart = new Map<string, { questionId: string; similarity: number }[]>();
      for (const match of matches) {
        const list = matchesByCounterpart.get(match.counterpartAttemptId) ?? [];
        list.push({ questionId: match.questionId, similarity: match.similarity });
        matchesByCounterpart.set(match.counterpartAttemptId, list);
      }

      for (const [counterpartAttemptId, counterpartMatches] of matchesByCounterpart) {
        await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
          const existing = await tx.integrityAnalysis.findUnique({ where: { attemptId: counterpartAttemptId } });
          if (!existing) {
            // Counterpart hasn't settled/analyzed yet — its own settlement run will discover this pair.
            return;
          }

          const existingFlags: IntegrityFlag[] = existing.flagsJson ? JSON.parse(existing.flagsJson) : [];
          const updatedFlags = [...existingFlags];
          let changed = false;
          for (const match of counterpartMatches) {
            const alreadyPresent = updatedFlags.some(
              (f) => f.type === 'similarity_match' && f.counterpartAttemptId === attemptId && f.questionId === match.questionId,
            );
            if (alreadyPresent) continue;
            updatedFlags.push({
              type: 'similarity_match',
              severity: match.similarity >= SIMILARITY_HIGH ? 'high' : 'medium',
              detail: similarityDetail(match.similarity),
              questionId: match.questionId,
              counterpartAttemptId: attemptId,
              similarity: match.similarity,
            });
            changed = true;
          }
          if (!changed) return;

          await tx.integrityAnalysis.update({
            where: { attemptId: counterpartAttemptId },
            // Narrative was written before this flag existed, so it no longer reflects the
            // full evidence -- null it out rather than leave a stale sentence (e.g. "No
            // integrity concerns detected") contradicting the just-updated level.
            data: { flagsJson: JSON.stringify(updatedFlags), level: deriveLevel(updatedFlags), narrative: null },
          });
        });
      }
    } catch (error) {
      this.logger.error(`Counterpart integrity update failed for attempt ${attemptId}`, error as Error);
    }
  }
}
