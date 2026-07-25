import { BadRequestException, Body, Controller, Get, HttpCode, Inject, Logger, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
import { CodeReviewService } from '../code-review/code-review.service';
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
import { ATTEMPT_STATUS_BROADCASTER, AttemptStatusBroadcaster } from '../monitoring/attempt-status-broadcaster';
import { InternalAuthGuard } from './internal-auth.guard';
import { effectiveDurationMinutes } from '../grading/grading';
import { isProctoringBypassActive } from '../attempts/proctoring-config';
import { NotifyMessageSentDto } from './dto/notify-message-sent.dto';
import { SettleIfExpiredBatchDto } from './dto/settle-if-expired-batch.dto';
import { GradeCodeAnswerDto } from './dto/grade-code-answer.dto';
import { ApplyProctoringBypassDto, RevokeProctoringBypassDto } from './dto/proctoring-bypass.dto';

@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  private readonly logger = new Logger(InternalController.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly attemptInsight: AttemptInsightService,
    private readonly codeReviewService: CodeReviewService,
    private readonly pistonRuntimes: PistonRuntimesService,
    @Inject(ATTEMPT_STATUS_BROADCASTER) private readonly broadcaster: AttemptStatusBroadcaster,
  ) {}

  @Post('attempts/:id/force-submit')
  async forceSubmit(@Param('id') id: string) {
    const finalized = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({
        where: { id },
        include: { invitation: { include: { exam: true } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Attempt ${id} cannot be force-submitted from status "${attempt.status}"`);
      }
      const exam = attempt.invitation.exam;
      return this.attemptSettlement.finalize(tx, exam, attempt, 'force_submitted');
    });
    return { status: finalized.status };
  }

  @Post('attempts/:id/unblock')
  async unblock(@Param('id') id: string) {
    const updated = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      if (attempt.status !== 'blocked') {
        throw new BadRequestException(`Attempt ${id} cannot be unblocked from status "${attempt.status}"`);
      }
      return this.attemptSettlement.resumeFromPause(tx, attempt, { resetViolationCounters: true });
    });
    return { status: updated.status };
  }

  // A bypass is deliberately allowed from in_progress, paused and blocked: the
  // recruiter is rescuing a candidate whose environment keeps tripping false
  // positives, and that candidate may be in any of those three states.
  private static readonly BYPASSABLE_STATUSES = ['in_progress', 'paused', 'blocked'];

  @Post('attempts/:id/proctoring-bypass')
  async applyProctoringBypass(@Param('id') id: string, @Body() dto: ApplyProctoringBypassDto) {
    const { examId, ...result } = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      if (!InternalController.BYPASSABLE_STATUSES.includes(attempt.status)) {
        throw new BadRequestException(`Attempt ${id} cannot be bypassed from status "${attempt.status}"`);
      }
      const bypassedAt = new Date();
      await tx.attempt.update({
        where: { id },
        data: {
          proctoringBypassedAt: bypassedAt,
          proctoringBypassedBy: dto.actorUserId,
          proctoringBypassReason: dto.reason.trim(),
          // A re-apply after a revoke must clear the revocation, or the new bypass
          // would read as already revoked and never take effect.
          proctoringBypassRevokedAt: null,
        },
      });
      // Reset counters and resume: the candidate may already be paused or blocked by
      // the very false positives being forgiven, so leaving them stuck would defeat
      // the point of the bypass.
      const resumed = await this.attemptSettlement.resumeFromPause(tx, attempt, { resetViolationCounters: true });
      return { examId: attempt.examId, status: resumed.status, proctoringBypassedAt: bypassedAt.toISOString() };
    });
    this.broadcastProctoringBypass(examId, id, true);
    return result;
  }

  @Post('attempts/:id/proctoring-bypass/revoke')
  async revokeProctoringBypass(@Param('id') id: string, @Body() _dto: RevokeProctoringBypassDto) {
    const { examId, ...result } = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      if (!InternalController.BYPASSABLE_STATUSES.includes(attempt.status)) {
        throw new BadRequestException(`Attempt ${id} cannot have its proctoring bypass revoked from status "${attempt.status}"`);
      }
      // Without this, revoke is an unblock with no `status === 'blocked'` restriction:
      // it would wipe the strike history of a never-bypassed attempt and audit that as
      // a bypass revocation.
      if (!isProctoringBypassActive(attempt)) {
        throw new BadRequestException(`Attempt ${id} has no active proctoring bypass to revoke`);
      }
      await tx.attempt.update({
        where: { id },
        // The bypass columns stay: the integrity report must still disclose that
        // enforcement was relaxed, and for how long. Only the revocation is written.
        data: { proctoringBypassRevokedAt: new Date() },
      });
      // Counters must reset here too. Warn mode still increments them, so an attempt
      // that spent time bypassed can sit far past the strike limit -- restoring
      // enforcement without clearing them would block the candidate instantly.
      const resumed = await this.attemptSettlement.resumeFromPause(tx, attempt, { resetViolationCounters: true });
      return { examId: attempt.examId, status: resumed.status, proctoringBypassedAt: null };
    });
    this.broadcastProctoringBypass(examId, id, false);
    return result;
  }

  // Fire-and-forget, like finalize()'s status broadcast: the roster is socket state,
  // not a react-query cache, so without this push the recruiter's row keeps offering
  // "Relax proctoring" on an already-bypassed attempt until they reload the page.
  private broadcastProctoringBypass(examId: string, attemptId: string, proctoringBypassed: boolean): void {
    void this.broadcaster
      .emitProctoringBypass(examId, { attemptId, proctoringBypassed })
      .catch((error) => this.logger.error('Failed to broadcast proctoring bypass', error as Error));
  }

  @Post('attempts/:id/answers/:questionId/grade')
  async gradeCodeAnswer(@Param('id') id: string, @Param('questionId') questionId: string, @Body() dto: GradeCodeAnswerDto) {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const answer = await tx.answer.findFirst({ where: { attemptId: id, questionId }, include: { question: true } });
      if (!answer) {
        throw new NotFoundException(`No answer found for attempt ${id}, question ${questionId}`);
      }
      if (answer.question.type !== 'code') {
        throw new BadRequestException(`Question ${questionId} is not a code question`);
      }
      if (dto.marksAwarded > answer.question.marks) {
        throw new BadRequestException(`marksAwarded (${dto.marksAwarded}) cannot exceed the question's marks (${answer.question.marks})`);
      }
      const updated = await tx.answer.update({
        where: { id: answer.id },
        data: { marksAwarded: dto.marksAwarded, gradingFeedback: dto.feedback ?? null },
      });
      return { questionId, marksAwarded: updated.marksAwarded, gradingFeedback: updated.gradingFeedback };
    });
  }

  @Post('attempts/:id/finalize-manual-grade')
  async finalizeManualGrade(@Param('id') id: string) {
    const finalized = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id }, include: { invitation: { include: { exam: true } } } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      return this.attemptSettlement.finalizeManualGrade(tx, attempt.invitation.exam, attempt);
    });
    return { status: finalized.status };
  }

  @Post('attempts/:id/reanalyze')
  @HttpCode(204)
  async reanalyze(@Param('id') id: string): Promise<void> {
    await this.attemptAnalysis.analyze(id);
  }

  @Post('attempts/:id/regenerate-insight')
  @HttpCode(204)
  async regenerateInsight(@Param('id') id: string): Promise<void> {
    await this.attemptInsight.analyze(id);
  }

  @Post('attempts/answers/:answerId/generate-code-review')
  @HttpCode(204)
  async generateCodeReview(@Param('answerId') answerId: string): Promise<void> {
    await this.codeReviewService.analyze(answerId);
  }

  @Post('attempts/settle-if-expired-batch')
  @HttpCode(204)
  async settleIfExpiredBatch(@Body() dto: SettleIfExpiredBatchDto): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { id: { in: dto.attemptIds } },
        include: { invitation: { include: { exam: true } } },
      });
      for (const attempt of attempts) {
        const exam = {
          ...attempt.invitation.exam,
          durationMinutes: effectiveDurationMinutes(attempt.invitation.exam.durationMinutes, attempt.invitation.extraTimePercent),
        };
        await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      }
    });
  }

  @Get('code-execution/languages')
  async listCodeLanguages() {
    const languages = await this.pistonRuntimes.getAvailableLanguages();
    return { languages };
  }

  @Post('monitoring/message-sent')
  @HttpCode(204)
  async notifyMessageSent(@Body() dto: NotifyMessageSentDto): Promise<void> {
    // Fire-and-forget, mirroring finalize()'s broadcast — this is a best-effort UI push, not a
    // core action. The message itself is already persisted by the caller (apps/api) before this
    // internal call is made; if this awaited and threw on a relay hiccup, the caller would report
    // a failed send for a message that was actually sent, and skip its own audit write.
    void this.broadcaster
      .emitMessageSent(dto.examId, {
        attemptId: dto.attemptId,
        candidateId: dto.candidateId,
        sentAt: new Date(dto.sentAt),
      })
      .catch((error) => this.logger.error('Failed to broadcast message-sent notification', error as Error));
  }
}
