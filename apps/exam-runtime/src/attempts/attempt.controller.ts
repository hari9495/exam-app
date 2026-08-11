import { Body, Controller, Get, Header, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CandidateJwtAuthGuard } from '../candidate-auth/candidate-jwt-auth.guard';
import { CurrentCandidate, CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { AttemptService } from './attempt.service';
import { resolveClientIp } from '../network/resolve-client-ip';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
import { ClientErrorDto } from './dto/client-error.dto';
import { RunCodeDto } from './dto/run-code.dto';
import { WebcamViolationDto } from './dto/webcam-violation.dto';
import { WebcamSnapshotDto } from './dto/webcam-snapshot.dto';
import { FaceEnrolmentDto } from './dto/face-enrolment.dto';
import { ScreenShareStateDto } from './dto/screen-share-state.dto';
import { ScreenAnalysisDto } from './dto/screen-analysis.dto';
import { MODERATE_ATTEMPT_THROTTLE, STRICT_CODE_RUN_THROTTLE } from '../rate-limit-tiers';

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
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  start(@CurrentCandidate() candidate: CandidateSession, @Body() dto: StartAttemptDto, @Req() req: Request) {
    return this.attemptService.start(candidate, dto, resolveClientIp(req), {
      configKeyHash: req.get('x-safeexambrowser-configkeyhash') ?? undefined,
      // The URL exactly as the client addressed it -- SEB hashes this string. TRUST_PROXY
      // makes protocol/host reflect the public origin behind nginx.
      requestUrl: `${req.protocol}://${req.get('host')}${req.originalUrl}`,
    });
  }

  @Get('seb-config')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  @Header('Content-Type', 'application/seb')
  @Header('Content-Disposition', 'attachment; filename="exam.seb"')
  async sebConfig(@CurrentCandidate() candidate: CandidateSession): Promise<string> {
    const { plistXml } = await this.attemptService.getSebConfig(candidate);
    return plistXml;
  }

  @Post('answer')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  answer(@CurrentCandidate() candidate: CandidateSession, @Body() dto: AnswerDto) {
    return this.attemptService.answer(candidate, dto);
  }

  @Post('submit')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  submit(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.submit(candidate);
  }

  @Post('client-error')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  clientError(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ClientErrorDto) {
    return this.attemptService.reportClientError(candidate, dto);
  }

  @Post('proctoring-event')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  reportProctoringEvent(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ReportProctoringEventDto) {
    return this.attemptService.reportProctoringEvent(candidate, dto);
  }

  @Post('webcam-violation')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  webcamViolation(@CurrentCandidate() candidate: CandidateSession, @Body() dto: WebcamViolationDto) {
    return this.attemptService.webcamViolation(candidate, dto);
  }

  @Post('webcam-snapshot')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  webcamSnapshot(@CurrentCandidate() candidate: CandidateSession, @Body() dto: WebcamSnapshotDto) {
    return this.attemptService.webcamSnapshot(candidate, dto);
  }

  @Post('face-enrolment')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  faceEnrolment(@CurrentCandidate() candidate: CandidateSession, @Body() dto: FaceEnrolmentDto) {
    return this.attemptService.recordFaceEnrolment(candidate, dto);
  }

  @Post('webcam-resume')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  webcamResume(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.webcamResume(candidate);
  }

  @Post('screen-share-state')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  screenShareState(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ScreenShareStateDto) {
    return this.attemptService.screenShareState(candidate, dto);
  }

  @Post('screen-analysis')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  screenAnalysis(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ScreenAnalysisDto) {
    return this.attemptService.analyzeScreenCapture(candidate, dto);
  }

  @Get('leaderboard')
  getLeaderboard(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.getLeaderboard(candidate);
  }

  @Get('code-languages')
  getCodeLanguages() {
    return this.attemptService.getCodeLanguages();
  }

  @Post('run-code')
  @Throttle(STRICT_CODE_RUN_THROTTLE)
  runCode(@CurrentCandidate() candidate: CandidateSession, @Body() dto: RunCodeDto) {
    return this.attemptService.runCode(candidate, dto);
  }
}
