import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { InternalAuthGuard } from './internal-auth.guard';
import { NotifyMessageSentDto } from './dto/notify-message-sent.dto';

@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}

  @Post('attempts/:id/force-submit')
  async forceSubmit(@Param('id') id: string) {
    const attempt = await this.prisma.attempt.findUnique({
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
    const finalized = await this.prisma.$transaction((tx) => this.attemptSettlement.finalize(tx, exam, attempt, 'force_submitted'));
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
    const attempt = await this.prisma.attempt.findUnique({
      where: { id },
      include: { invitation: { include: { exam: true } } },
    });
    if (!attempt) {
      throw new NotFoundException(`Attempt ${id} not found`);
    }
    const exam = attempt.invitation.exam;
    await this.prisma.$transaction((tx) => this.attemptSettlement.settleIfExpired(tx, exam, attempt));
  }

  @Post('monitoring/message-sent')
  @HttpCode(204)
  async notifyMessageSent(@Body() dto: NotifyMessageSentDto): Promise<void> {
    this.monitoringGateway.emitMessageSent(dto.examId, {
      attemptId: dto.attemptId,
      candidateId: dto.candidateId,
      sentAt: new Date(dto.sentAt),
    });
  }
}
