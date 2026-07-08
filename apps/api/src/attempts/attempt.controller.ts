import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { CandidateJwtAuthGuard } from '../candidate-auth/candidate-jwt-auth.guard';
import { CurrentCandidate, CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { AttemptService } from './attempt.service';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';

@Controller('attempt')
@UseGuards(CandidateJwtAuthGuard)
@UseInterceptors(LastSeenInterceptor)
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Get('current')
  getCurrent(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.getCurrent(candidate);
  }

  @Post('start')
  start(@CurrentCandidate() candidate: CandidateSession, @Body() dto: StartAttemptDto) {
    return this.attemptService.start(candidate, dto);
  }

  @Post('answer')
  answer(@CurrentCandidate() candidate: CandidateSession, @Body() dto: AnswerDto) {
    return this.attemptService.answer(candidate, dto);
  }

  @Post('submit')
  submit(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.submit(candidate);
  }

  @Post('proctoring-event')
  reportProctoringEvent(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ReportProctoringEventDto) {
    return this.attemptService.reportProctoringEvent(candidate, dto);
  }
}
