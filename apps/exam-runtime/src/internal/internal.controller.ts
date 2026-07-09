import { BadRequestException, Body, Controller, HttpCode, Inject, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { ATTEMPT_STATUS_BROADCASTER, AttemptStatusBroadcaster } from '../monitoring/attempt-status-broadcaster';
import { InternalAuthGuard } from './internal-auth.guard';
import { NotifyMessageSentDto } from './dto/notify-message-sent.dto';

@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly attemptAnalysis: AttemptAnalysisService,
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

  @Post('attempts/:id/reanalyze')
  @HttpCode(204)
  async reanalyze(@Param('id') id: string): Promise<void> {
    await this.attemptAnalysis.analyze(id);
  }

  @Post('attempts/:id/settle-if-expired')
  @HttpCode(204)
  async settleIfExpired(@Param('id') id: string): Promise<void> {
    await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({
        where: { id },
        include: { invitation: { include: { exam: true } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      const exam = attempt.invitation.exam;
      await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
    });
  }

  @Post('monitoring/message-sent')
  @HttpCode(204)
  async notifyMessageSent(@Body() dto: NotifyMessageSentDto): Promise<void> {
    await this.broadcaster.emitMessageSent(dto.examId, {
      attemptId: dto.attemptId,
      candidateId: dto.candidateId,
      sentAt: new Date(dto.sentAt),
    });
  }
}
