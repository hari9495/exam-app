import { Body, Controller, Get, Header, HttpCode, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CandidateJwtAuthGuard } from '../candidate-auth/candidate-jwt-auth.guard';
import { CurrentCandidate, CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { AttemptService } from './attempt.service';
import { DeliveryService } from './delivery.service';
import { ReuseDto } from './dto/reuse.dto';
import { AccommodationService } from './accommodation.service';
import { AccommodationDto } from './dto/accommodation.dto';
import { resolveClientIp } from '../network/resolve-client-ip';
import { AnswerDto, SurveyDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
import { ClientErrorDto } from './dto/client-error.dto';
import { RunCodeDto } from './dto/run-code.dto';
import { UploadAnswerFileDto, RemoveAnswerFileDto } from './dto/answer-file.dto';
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
  constructor(
    private readonly attemptService: AttemptService,
    private readonly delivery: DeliveryService,
    private readonly accommodations: AccommodationService,
  ) {}

  /** AS-3 (PRC-21): this candidate's tests at this company. */
  @Get('my-tests')
  myTests(@CurrentCandidate() candidate: CandidateSession) {
    return this.delivery.myTests(candidate);
  }

  /** AS-3 (answer 2013, PRC-32): an earlier result on the same test this invitation may use. */
  @Get('reuse')
  reuseOffer(@CurrentCandidate() candidate: CandidateSession) {
    return this.delivery.reuseOffer(candidate);
  }

  @Post('reuse')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  useResult(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ReuseDto) {
    return this.delivery.useResult(candidate, dto.attemptId);
  }

  @Post('reuse/withdraw')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  withdrawReuse(@CurrentCandidate() candidate: CandidateSession) {
    return this.delivery.withdrawReuse(candidate);
  }

  /** AS-4b (answer 2011, PRC-23): the candidate's requests for help and what was approved for them. */
  @Get('accommodation')
  accommodation(@CurrentCandidate() candidate: CandidateSession) {
    return this.accommodations.help(candidate);
  }

  /** AS-4b: ask for help before the test (one open request at a time; evidence optional). */
  @Post('accommodation')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  askAccommodation(@CurrentCandidate() candidate: CandidateSession, @Body() dto: AccommodationDto) {
    return this.accommodations.ask(candidate, dto);
  }

  @Get('current')
  getCurrent(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.getCurrent(candidate);
  }

  @Get('certificate')
  getCertificate(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.getCertificate(candidate);
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

  @Post('answer-file')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  uploadAnswerFile(@CurrentCandidate() candidate: CandidateSession, @Body() dto: UploadAnswerFileDto) {
    return this.attemptService.uploadAnswerFile(candidate, dto);
  }

  @Post('answer-file/remove')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  removeAnswerFile(@CurrentCandidate() candidate: CandidateSession, @Body() dto: RemoveAnswerFileDto) {
    return this.attemptService.removeAnswerFile(candidate, dto);
  }

  @Post('submit')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  submit(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.submit(candidate);
  }

  // AS-4a (PRC-26): breaks, back after a lost connection, and the optional after-test survey.
  @Post('break/start')
  @HttpCode(200)
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  startBreak(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.startBreak(candidate);
  }

  @Post('break/end')
  @HttpCode(200)
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  endBreak(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.endBreak(candidate);
  }

  @Post('reconnected')
  @HttpCode(200)
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  reconnected(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.reconnected(candidate);
  }

  @Post('survey')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  survey(@CurrentCandidate() candidate: CandidateSession, @Body() dto: SurveyDto) {
    return this.attemptService.submitSurvey(candidate, dto);
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

  @Post('face-warning-ack')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  faceWarningAck(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.ackFaceWarning(candidate);
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
