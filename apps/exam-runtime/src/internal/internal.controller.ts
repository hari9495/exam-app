import { BadRequestException, Body, Controller, HttpCode, Inject, Logger, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
import { CodeReviewService } from '../code-review/code-review.service';
import { ATTEMPT_STATUS_BROADCASTER, AttemptStatusBroadcaster } from '../monitoring/attempt-status-broadcaster';
import { InternalAuthGuard } from './internal-auth.guard';
import { NotifyMessageSentDto } from './dto/notify-message-sent.dto';
import { SettleIfExpiredBatchDto } from './dto/settle-if-expired-batch.dto';
import { GradeCodeAnswerDto } from './dto/grade-code-answer.dto';

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
        await this.attemptSettlement.settleIfExpired(tx, attempt.invitation.exam, attempt);
      }
    });
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
