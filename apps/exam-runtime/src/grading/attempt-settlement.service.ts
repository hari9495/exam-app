import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult, computeRemainingSeconds, GradableSection } from './grading';
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

// Stamped on a code answer the candidate never wrote in, so a 0 in the report is explained
// rather than looking like a human's verdict on submitted work.
export const NOT_ATTEMPTED_FEEDBACK = 'Not attempted.';

// "Did the candidate write any code here?" -- the single test that decides whether a code
// question needs a human. Whitespace only counts as nothing; so does starter code the candidate
// never touched being absent entirely. Mirrored in apps/api's getPendingGrading, which hides the
// same answers from the grading queue -- one predicate, duplicated rather than shared, because
// it is one line and the two apps have no common runtime module for it.
function isAttemptedCode(answer: { answerText: string | null } | undefined): boolean {
  return Boolean(answer?.answerText && answer.answerText.trim().length > 0);
}

// The three owners a pause can be attributed to. browser_activity is a bucket shared by all
// nine event types registerBrowserActivityViolation handles (including screen_share_stopped,
// a strike distinct from screen_share's own precondition pause below). webcam and
// browser_activity share one resume action (resumeFromPause, called with no reason filter by
// webcamResume) since both are strike pauses cleared by acknowledgement; screen_share is a
// precondition, only cleared by screenShareState's active:true path.
export type PauseReason = 'webcam' | 'browser_activity' | 'screen_share';

// Mirrors what AttemptService stamps into Attempt.sectionSnapshotJson at attempt-start. Read
// (rather than re-queried from ExamSection) deliberately: the snapshot is the frozen, per-attempt
// truth -- a recruiter editing weights after this candidate started must not retroactively
// rescore them, and a pool section's drawn questionIds only exist here.
interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  targetDurationMinutes: number | null;
  weightPercent: number;
  requiredCount: number | null;
  questionIds: string[];
}

// Attempts that STARTED before section weighting shipped carry a snapshot with no weightPercent
// on its entries. Defaulting those to 0 (the obvious reading) would give every section a zero
// share, scoring every such in-flight candidate at 0% and failing them -- so a legacy snapshot
// instead degrades to one synthetic 100%-weighted section spanning every question, which is
// arithmetically the exact flat formula those attempts were started under.
//
// weightOverrides is the one deliberate exception to "the snapshot is frozen" (see the comment
// on SectionSnapshotEntry above): recomputeSettledResults (below) passes the exam's CURRENT
// per-section weights here, on purpose, because a recruiter editing weights after submission is
// asking for exactly that -- see that method's own comment for why this is opt-in and audited
// rather than automatic.
function toGradableSections(
  sectionSnapshotJson: string,
  allQuestionIds: string[],
  weightOverrides?: Map<string, number>,
): GradableSection[] {
  let snapshot: SectionSnapshotEntry[];
  try {
    snapshot = JSON.parse(sectionSnapshotJson);
  } catch {
    snapshot = [];
  }
  const isLegacy = !Array.isArray(snapshot) || snapshot.length === 0
    || snapshot.some((section) => typeof section?.weightPercent !== 'number');
  if (isLegacy) {
    return [{ sectionId: '__flat__', weightPercent: 100, requiredCount: null, questionIds: allQuestionIds }];
  }
  return snapshot.map((section) => ({
    sectionId: section.sectionId,
    weightPercent: weightOverrides?.get(section.sectionId) ?? section.weightPercent,
    // A snapshot written before this feature has no key at all -- undefined must read as
    // "all required", never as 0, which would score every section out of nothing.
    requiredCount: section.requiredCount ?? null,
    questionIds: section.questionIds,
  }));
}

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

    // Only code questions the candidate actually WROTE something for need a human. An untouched
    // one has exactly one defensible mark -- zero -- so awarding it here spares the recruiter
    // clicking through a queue of empty editors. On one real attempt that was 15 of 19 questions.
    const attemptedCodeQuestions = questions.filter(
      (question) => question.type === 'code' && isAttemptedCode(answersByQuestionId.get(question.id)),
    );
    const hasCodeQuestions = attemptedCodeQuestions.length > 0;
    const gradedAnswers: { questionId: string; marksAwarded: number }[] = [];
    for (const question of questions) {
      if (question.type === 'code') {
        const existing = answersByQuestionId.get(question.id);
        if (!isAttemptedCode(existing)) {
          // Auto-zero, and record WHY, so the report reads "Not attempted." rather than a bare 0
          // that looks like a human judged the work. The row is still created when absent: the
          // candidate report and finalizeManualGrade() both walk answers, and no row would make
          // the question invisible rather than visibly unanswered.
          const scored = { marksAwarded: 0, isCorrect: false, gradingFeedback: NOT_ATTEMPTED_FEEDBACK };
          if (existing) {
            await tx.answer.update({ where: { id: existing.id }, data: scored });
          } else {
            await tx.answer.create({
              data: { attemptId: attempt.id, questionId: question.id, selectedOptionIdsJson: '[]', answerText: null, ...scored },
            });
          }
          gradedAnswers.push({ questionId: question.id, marksAwarded: 0 });
          continue;
        }
        // Attempted: manual grading only — never auto-graded, never contributes to gradedAnswers
        // until a recruiter enters marks via finalizeManualGrade().
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
    const sections = toGradableSections(
      attempt.sectionSnapshotJson,
      scoredQuestions.map((question) => question.id),
    );
    const summary = computeResult(gradedAnswers, scoredQuestions, exam.passCriteriaPercent, sections);
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

  // A recruiter's escape hatch: section weights are normally frozen per-attempt at start
  // (toGradableSections' comment above explains why) specifically so a later weight edit
  // can't silently rescore someone mid-exam. But once candidates have SUBMITTED, a recruiter
  // may legitimately want to rebalance which section counts more toward the pass/fail decision
  // -- that's the whole point of weighting -- without re-running the exam. This is the one
  // place that intentionally re-derives percentage/passFail from a stored Result's own attempt
  // using the exam's CURRENT weights instead of the frozen snapshot, gated on the caller (see
  // ExamsService.updateSection) only invoking it after an explicit weight change.
  //
  // Every other input is untouched: which questions counted (questionIds/requiredCount) and
  // each answer's marksAwarded are exactly what was already graded -- only the weighting of
  // already-graded sections against each other changes. score/maxScore can shift too when a
  // section has a requiredCount (selectCountedAnswers picks the best N, and weight doesn't
  // affect which N -- but they're recomputed here anyway so the headline numbers keep agreeing
  // with percentage, matching finalize()'s own invariant).
  async recomputeSettledResults(tx: Prisma.TransactionClient, examId: string): Promise<{ updated: number }> {
    const exam = await tx.exam.findUniqueOrThrow({ where: { id: examId }, select: { passCriteriaPercent: true } });
    const sections = await tx.examSection.findMany({ where: { examId }, select: { id: true, weightPercent: true } });
    const weightOverrides = new Map(sections.map((section) => [section.id, section.weightPercent]));

    // Only attempts that already have a Result have been graded at all -- querying from Result
    // (rather than filtering Attempt by a hardcoded status list) is the correct membership test
    // regardless of which terminal status ended up on the attempt. pending_manual_grade is
    // excluded on purpose: finalize() already created its Result row with passFail left null
    // (see finalize()'s own comment) because a code question is still ungraded -- recomputing
    // now would assign a real pass/fail off an incomplete score. finalizeManualGrade() derives
    // the real one once grading finishes and is unaffected by this method either way.
    const results = await tx.result.findMany({
      where: { attempt: { examId, status: { not: 'pending_manual_grade' } } },
      include: { attempt: true },
    });

    let updated = 0;
    for (const result of results) {
      const attempt = result.attempt;
      const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
      const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, select: { id: true, marks: true } });
      const answers = await tx.answer.findMany({ where: { attemptId: attempt.id }, select: { questionId: true, marksAwarded: true } });
      const gradedAnswers = answers
        .filter((answer): answer is { questionId: string; marksAwarded: number } => answer.marksAwarded !== null)
        .map((answer) => ({ questionId: answer.questionId, marksAwarded: answer.marksAwarded }));

      const sectionsForAttempt = toGradableSections(attempt.sectionSnapshotJson, questionIds, weightOverrides);
      const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent, sectionsForAttempt);

      if (
        summary.score === result.score
        && summary.maxScore === result.maxScore
        && summary.percentage === result.percentage
        && summary.passFail === result.passFail
      ) {
        continue;
      }
      await tx.result.update({
        where: { attemptId: attempt.id },
        data: { score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail },
      });
      updated += 1;
    }
    return { updated };
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

    // Attempts that were already sitting in the queue when auto-zeroing shipped still carry
    // blank code answers with marksAwarded === null. The queue no longer shows those, so without
    // this they would be unfinalizable -- invisible to the recruiter yet still blocking the
    // check below. Settle them here on the same rule settlement uses.
    for (const question of codeQuestions) {
      const answer = answersByQuestionId.get(question.id);
      if (answer && answer.marksAwarded === null && !isAttemptedCode(answer)) {
        await tx.answer.update({
          where: { id: answer.id },
          data: { marksAwarded: 0, isCorrect: false, gradingFeedback: NOT_ATTEMPTED_FEEDBACK },
        });
        answersByQuestionId.set(question.id, { ...answer, marksAwarded: 0 });
      }
    }

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
    const sections = toGradableSections(attempt.sectionSnapshotJson, questions.map((question) => question.id));
    const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent, sections);

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
