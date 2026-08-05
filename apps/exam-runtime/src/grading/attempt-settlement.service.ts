import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';
import { ATTEMPT_STATUS_BROADCASTER, AttemptStatusBroadcaster } from '../monitoring/attempt-status-broadcaster';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
import { IntegrityAnalysisService } from '../integrity/integrity-analysis.service';
import { WebcamViolationReason } from '../attempts/dto/webcam-violation.dto';
import { ApiInternalClient } from '../api-internal-client/api-internal.client';
import { getProctoringEventSeverity } from '../attempts/proctoring-severity';
import { resolveProctoringConfig } from '../attempts/proctoring-config';
import { sanitizeMetadataOrDrop } from '../attempts/sanitize-metadata';

const BROWSER_ACTIVITY_COOLDOWN_MS = 60_000;

// The three owners a pause can be attributed to. browser_activity is a bucket shared by all
// nine event types registerBrowserActivityViolation handles (including screen_share_stopped,
// a strike distinct from screen_share's own precondition pause below). webcam and
// browser_activity share one resume action (resumeFromPause, called with no reason filter by
// webcamResume) since both are strike pauses cleared by acknowledgement; screen_share is a
// precondition, only cleared by screenShareState's active:true path.
export type PauseReason = 'webcam' | 'browser_activity' | 'screen_share';

export interface SettlementExam {
  id: string;
  organizationId: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  enableAntiCheating: boolean;
  webcamProctoringEnabled: boolean;
  webcamRecordOnly: boolean;
  proctoringEnforcement: string;
  proctoringStrikeLimit: number;
  disabledProctoringSignalsJson: string | null;
  screenCaptureEnabled: boolean;
  lockdownRequired: boolean;
}

@Injectable()
export class AttemptSettlementService {
  private readonly logger = new Logger(AttemptSettlementService.name);

  constructor(
    @Inject(ATTEMPT_STATUS_BROADCASTER) private readonly broadcaster: AttemptStatusBroadcaster,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly attemptInsight: AttemptInsightService,
    private readonly integrityAnalysis: IntegrityAnalysisService,
    private readonly apiInternalClient: ApiInternalClient,
  ) {}

  remainingSeconds(
    exam: Pick<SettlementExam, 'durationMinutes'>,
    attempt: { startedAt: Date; pausedDurationMs: number; pausedAt: Date | null; status: string },
  ): number {
    const frozenAt = attempt.status === 'paused' || attempt.status === 'blocked' ? attempt.pausedAt : null;
    return computeRemainingSeconds(exam.durationMinutes, attempt.startedAt, attempt.pausedDurationMs, frozenAt);
  }

  private isExpired(
    exam: Pick<SettlementExam, 'durationMinutes'>,
    attempt: { startedAt: Date; pausedDurationMs: number; pausedAt: Date | null; status: string },
  ): boolean {
    return this.remainingSeconds(exam, attempt) <= 0;
  }

  async settleIfExpired(tx: Prisma.TransactionClient, exam: SettlementExam, attempt: Attempt): Promise<Attempt> {
    if (attempt.status !== 'in_progress' || !this.isExpired(exam, attempt)) {
      return attempt;
    }
    return this.finalize(tx, exam, attempt, 'auto_submitted');
  }

  async finalize(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    status: 'submitted' | 'auto_submitted' | 'force_submitted',
  ): Promise<Attempt> {
    const existingResult = await tx.result.findUnique({ where: { attemptId: attempt.id } });
    if (existingResult) {
      // A concurrent settlement (e.g. another request racing on the same expired attempt) already
      // created the Result for this attempt. Don't grade/create again — just return the current attempt.
      return tx.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    }

    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, include: { options: true } });
    const existingAnswers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(existingAnswers.map((answer) => [answer.questionId, answer]));

    const hasCodeQuestions = questions.some((question) => question.type === 'code');
    const gradedAnswers: { marksAwarded: number }[] = [];
    for (const question of questions) {
      if (question.type === 'code') {
        // Manual grading only — never auto-graded, never contributes to gradedAnswers until a
        // recruiter enters marks via finalizeManualGrade(). If the candidate never submitted
        // anything for this question, create a blank Answer row so it still surfaces in the
        // recruiter's grading queue instead of silently vanishing (no row = invisible question).
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
      gradedAnswers.push({ marksAwarded });
      if (answer) {
        await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, marksAwarded } });
      }
    }

    const scoredQuestions = hasCodeQuestions ? questions.filter((question) => question.type !== 'code') : questions;
    const summary = computeResult(gradedAnswers, scoredQuestions, exam.passCriteriaPercent);
    await tx.result.create({
      data: {
        attemptId: attempt.id,
        score: summary.score,
        maxScore: summary.maxScore,
        percentage: summary.percentage,
        passFail: hasCodeQuestions ? null : summary.passFail,
      },
    });

    const finalStatus = hasCodeQuestions ? 'pending_manual_grade' : status;
    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status: finalStatus, submittedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        organizationId: exam.organizationId,
        actorUserId: null,
        action: 'attempt.settled',
        entityType: 'attempt',
        entityId: finalized.id,
        metadataJson: JSON.stringify({ status, score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, {
        attemptId: finalized.id,
        candidateId: attempt.candidateId,
        status: finalized.status,
      })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    void (async () => {
      try {
        await this.attemptAnalysis.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Proctoring analysis failed to start', error as Error);
      }
      // Integrity analysis runs unconditionally (unlike insight below) — telemetry, paste, and
      // similarity evidence don't depend on grading, so it's useful even for pending_manual_grade.
      try {
        await this.integrityAnalysis.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Integrity analysis failed to start', error as Error);
      }
      // Skip insight generation for attempts pending manual grading — at this point the Result
      // is computed from MCQ-only scoredQuestions (code questions excluded) and passFail is null,
      // so an insight generated now would reflect an artificially skewed percentage. It's
      // regenerated in finalizeManualGrade() once the full, correct score is known.
      if (!hasCodeQuestions) {
        try {
          await this.attemptInsight.analyze(finalized.id);
        } catch (error) {
          this.logger.error('Insight generation failed to start', error as Error);
        }
      }
      try {
        await this.apiInternalClient.dispatchWebhook(exam.organizationId, 'attempt.settled', {
          attemptId: finalized.id,
          examId: finalized.examId,
          candidateId: finalized.candidateId,
          status: finalized.status,
          score: summary.score,
          maxScore: summary.maxScore,
          percentage: summary.percentage,
          passFail: summary.passFail,
        });
      } catch (error) {
        this.logger.error('Webhook dispatch failed to start', error as Error);
      }
    })();
    return finalized;
  }

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

    const gradedAnswers = questions.map((question) => ({ marksAwarded: answersByQuestionId.get(question.id)?.marksAwarded ?? 0 }));
    const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent);

    await tx.result.update({
      where: { attemptId: attempt.id },
      data: { score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail },
    });

    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status: 'submitted' } });
    await tx.auditLog.create({
      data: {
        organizationId: exam.organizationId,
        actorUserId: null,
        action: 'attempt.manually_graded',
        entityType: 'attempt',
        entityId: finalized.id,
        metadataJson: JSON.stringify({ score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: finalized.id, candidateId: attempt.candidateId, status: finalized.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    void (async () => {
      // Re-run integrity analysis now that marks are final — no_iteration depends on marksAwarded,
      // which is only known once manual grading completes. The upsert makes re-running safe.
      try {
        await this.integrityAnalysis.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Integrity analysis failed to start', error as Error);
      }
      try {
        await this.attemptInsight.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Insight generation failed to start', error as Error);
      }
    })();
    return finalized;
  }

  async registerWebcamViolation(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    reason: WebcamViolationReason,
    snapshot: string,
    // Screen-capture overlay from AttemptService's decideScreenCapture/uploadScreenCapture/
    // commitScreenCapture split -- server-authoritative (an upload URL or a screenshotCapReached
    // flag), applied directly here with no sanitization pass. That's deliberate, not an
    // oversight: unlike registerBrowserActivityViolation, this method never merges in
    // client-supplied metadata, so there is no forged-key filter for a server-set `screenshot`
    // key to collide with in the first place.
    screenshotMetadata?: Record<string, unknown>,
  ): Promise<{ attempt: Attempt; strike: number }> {
    const { enforcement, webcamRecordOnly, strikeLimit } = resolveProctoringConfig(exam, attempt);
    // webcamRecordOnly downgrades this violation to warn-only regardless of the exam's
    // enforcement mode -- still detected, recorded and counted (below), never punished.
    // The "Watch for" browser signals are untouched and keep using `enforcement` as-is
    // (see registerBrowserActivityViolation).
    const webcamEnforcement = webcamRecordOnly ? 'warn' : enforcement;
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
        metadataJson: JSON.stringify({ snapshot, strike, ...screenshotMetadata }),
      },
    });
    // The caller (attempt.service.ts's webcamViolation) only ever reaches this with an attempt
    // that was in_progress when *read* -- but as of ADO #6810 fix round 1, that read and this
    // write are no longer in the same transaction: the write lands in a later, separate
    // transaction, up to the upload's duration afterwards. The caller re-reads the attempt fresh
    // immediately before calling this, so `attempt.status`/`attempt.pausedReason` here reflect
    // whatever landed in that gap -- which is no longer just "a different owner paused it"
    // (mirroring registerBrowserActivityViolation's wasAlreadyPaused guard below), it can also be
    // a terminal state: `blocked` (a different violation path already ended the attempt) or
    // `submitted`/`expired` (the candidate finished during the upload window). `isLive` covers
    // all three: for a non-live attempt, don't touch status at all (no resurrecting a submitted
    // attempt back to `paused`, and no downgrading `blocked` back to `paused` the way a bare
    // `atLimit ? 'blocked' : 'paused'` would for a strike that isn't itself at the limit), and
    // don't stamp pausedAt/pausedReason either -- `webcamResume`
    // (attempt.service.ts's webcamResume) only accepts pausedReason 'webcam', so overwriting a
    // blocked attempt's fields with a webcam owner would let a candidate resume out of a block a
    // different path deliberately imposed (the exact invariant screenShareState and
    // registerBrowserActivityViolation's own blocked-early-return both protect). Warn-only still
    // records and counts but never interrupts the candidate, live or not.
    const isLive = attempt.status === 'in_progress' || attempt.status === 'paused';
    const status = webcamEnforcement === 'warn' || !isLive ? attempt.status : atLimit ? 'blocked' : 'paused';
    const keepExistingPause = !isLive || attempt.status === 'paused';
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        webcamViolationCount: strike,
        status,
        ...(keepExistingPause
          ? {}
          : webcamEnforcement === 'warn'
            ? { pausedAt: null, pausedReason: null }
            : { pausedAt: new Date(), pausedReason: 'webcam' as const }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return { attempt: updated, strike };
  }

  async registerBrowserActivityViolation(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    eventType: string,
    metadata?: Record<string, unknown>,
    serverMetadata?: Record<string, unknown>,
  ): Promise<{ attempt: Attempt; strike: number; event: { id: string; eventType: string; severity: string } }> {
    const cooldownCutoff = new Date(Date.now() - BROWSER_ACTIVITY_COOLDOWN_MS);
    const recentSameType = await tx.proctoringEvent.findFirst({
      where: {
        attemptId: attempt.id,
        eventType,
        occurredAt: { gt: cooldownCutoff },
        // A screenShareState 'absent' row (no strike, no enforcement -- see
        // attempt.service.ts#screenShareState) must not itself arm this cooldown: a refresh
        // followed within 60s by a real Stop-sharing click would otherwise find that row,
        // read isFreshStrike as false, and silently drop the strike. Repeating
        // refresh-then-stop indefinitely would hold this signal's strike count at zero forever
        // and make "block after N strikes" enforcement conditionally inert for it.
        //
        // `metadata_json` is nullable, and SQL's `NOT (col LIKE ...)` is UNKNOWN (excluded, not
        // included) for a NULL column -- a bare `NOT: { metadataJson: { contains: ... } } }`
        // would silently drop every NULL-metadata row out of the cooldown lookup entirely
        // (right_click, tab_switch, idle_timeout, and every event on every screen-capture-off
        // exam, since capture is a per-exam toggle -- NULL is the common case here, not an
        // edge case). Explicitly re-admit NULL rows via the OR so the cooldown's behavior for
        // every event type this predicate wasn't written for is unchanged.
        //
        // Any client can emit `{ reason: 'absent' }` through reportProctoringEvent's free-form
        // metadata -- this predicate can only fail OPEN (make a row invisible to the cooldown,
        // meaning more strikes land, never fewer), so a forged value can only cost the forger
        // strikes, never suppress one. It is not a guarantee that only the server-written
        // 'absent' row matches; it only has to be safe if something else does.
        //
        // SQL_Latin1_General_CP1_CI_AS folds case and width for LIKE, so `{"REASON":"ABSENT"}`
        // and fullwidth-character variants also match this NOT -- same fail-open direction,
        // so still not a defect, but written down here since the collation's breadth has been
        // the exact class of surprise that cost several rounds of fixes elsewhere in this file.
        OR: [{ metadataJson: null }, { NOT: { metadataJson: { contains: '"reason":"absent"' } } }],
      },
      orderBy: { occurredAt: 'desc' },
    });

    // This is the one place every strike-worthy write funnels through (reportProctoringEvent's
    // strike branch, screenShareState's stop path), so the metadata guard lives here rather
    // than at each caller -- see sanitize-metadata.ts for what it checks and why. Only the
    // client-supplied `metadata` goes through the guard; `serverMetadata` (e.g. the uploaded
    // screenshot URL) is server-authoritative and applied *after*, never subject to it -- the
    // guard's own key filter matches on "screenshot" as a substring, so sanitizing the two
    // together would strip the server's own `screenshot`/`screenshotCapReached` keys right back
    // out (that regression is exactly what this split fixes -- see scc-task-5-report.md fix
    // round 6).
    const safeMetadata = sanitizeMetadataOrDrop(metadata, this.logger, attempt.id, eventType);
    const combinedMetadata = safeMetadata || serverMetadata ? { ...safeMetadata, ...serverMetadata } : undefined;
    const event = await tx.proctoringEvent.create({
      data: {
        attemptId: attempt.id,
        eventType,
        severity: getProctoringEventSeverity(eventType),
        metadataJson: combinedMetadata ? JSON.stringify(combinedMetadata) : null,
      },
    });

    const isFreshStrike = !recentSameType;
    if (!isFreshStrike || attempt.status === 'blocked') {
      return { attempt, strike: attempt.browserActivityViolationCount, event };
    }

    const { enforcement, strikeLimit } = resolveProctoringConfig(exam, attempt);
    const strike = attempt.browserActivityViolationCount + 1;
    // Unlike registerWebcamViolation, this has no call-site guard keeping it to in_progress
    // attempts only -- reportProctoringEvent and screenShareState's stop path both call this
    // regardless of current status (blocked is excluded above, but paused is not). Without this,
    // a strike arriving while already paused (by this owner or a different one) would
    // unconditionally re-stamp pausedAt below, and the wall-clock between the original pause and
    // this strike would never be credited back in resumeFromPause's elapsedMs -- a silent loss of
    // exam time. Escalation to blocked must still work from an already-paused attempt (a
    // persistent violator shouldn't be shielded from the strike limit by being paused), so only
    // the pausedAt/pausedReason stamp -- not the strike count or the status transition -- is
    // skipped when already paused.
    const wasAlreadyPaused = attempt.status === 'paused';
    const status = enforcement === 'warn' ? attempt.status : strike >= strikeLimit ? 'blocked' : 'paused';
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: {
        browserActivityViolationCount: strike,
        status,
        ...(wasAlreadyPaused
          ? {}
          : enforcement === 'warn'
            ? { pausedAt: null, pausedReason: null }
            : { pausedAt: new Date(), pausedReason: 'browser_activity' as const }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return { attempt: updated, strike, event };
  }

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
        // Unconditional, same as pausedAt -- this is the single place a paused/blocked attempt
        // ever transitions back to in_progress (submit/settleIfExpired/forceSubmit all require
        // in_progress already), so there is no other place that needs to null it. Every caller
        // that shouldn't be able to clear a given owner's pause (e.g. webcamResume clearing a
        // screen_share pause) is responsible for checking pausedReason itself before calling in.
        pausedReason: null,
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
}
