import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../internal/internal-auth.guard';
import { MonitoringGateway } from './monitoring.gateway';
import { RelayAttemptStatusDto } from './dto/relay-attempt-status.dto';
import { RelayMessageSentDto } from './dto/relay-message-sent.dto';

// Receives broadcast-relay calls from the internal app, which has no direct
// connection to any recruiter's WebSocket session (those connect here, to
// the public app's MonitoringGateway). Gated by the same shared secret as
// the internal surface itself, since this is reachable on the public app's
// listener (0.0.0.0) and must not be triggerable by an unauthenticated caller.
@Controller('monitoring-relay')
@UseGuards(InternalAuthGuard)
export class BroadcastRelayController {
  constructor(private readonly monitoringGateway: MonitoringGateway) {}

  @Post('attempt-status')
  @HttpCode(204)
  attemptStatus(@Body() dto: RelayAttemptStatusDto): void {
    this.monitoringGateway.emitAttemptStatus(dto.examId, {
      attemptId: dto.attemptId,
      candidateId: dto.candidateId,
      status: dto.status,
    });
  }

  @Post('message-sent')
  @HttpCode(204)
  messageSent(@Body() dto: RelayMessageSentDto): void {
    this.monitoringGateway.emitMessageSent(dto.examId, {
      attemptId: dto.attemptId,
      candidateId: dto.candidateId,
      sentAt: new Date(dto.sentAt),
    });
  }
}
