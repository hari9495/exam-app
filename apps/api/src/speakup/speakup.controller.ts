import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, PUBLIC_API_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import { assertOwnSession } from '../service-desk/desk-access';
import { AnonymousReportDto, CodeDto, ReplyDto, ReportDto, TeamMemberDto, TeamReplyDto } from './dto';
import { SpeakupService } from './speakup.service';

// HLP-06 speak-up (rules: docs/yukthix/helpdesk-design-map.md section 4e). Keys (P02 YX-SEC-01):
//   no key (self)            the form and a named report by the signed-in person (not while acting for someone else)
//   no key (case officer)    the cases routed to the signed-in officer: being routed is the access (404 otherwise)
//   speakup.setup.manage     the lists of case officers (grievance, ethics, Internal Committee, escalation) and the
//                            safety team who receives accident reports (HLP-12) and the industrial relations team who
//                            keeps collective disputes (HLP-13)
//   no login (public)        an anonymous report and "check my report" with the reply code; throttled; the server
//                            never learns who sent it (no user, no IP or device stored)
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

@Controller('desk/speakup')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SpeakupController {
  constructor(private readonly speakup: SpeakupService) {}

  @Get('form')
  form(@CurrentTenant() ctx: TenantContext) {
    return this.speakup.form(ctx);
  }

  @Post('reports')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  file(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReportDto) {
    assertOwnSession(req);
    return this.speakup.fileNamed(ctx, dto);
  }

  @Post('reports/:id/files')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  addFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.speakup.addNamedFile(ctx, id, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get('cases')
  cases(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.speakup.myCases(ctx);
  }

  @Get('cases/:id')
  caseDetail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.speakup.caseDetail(ctx, id);
  }

  @Post('cases/:id/messages')
  teamReply(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TeamReplyDto) {
    assertOwnSession(req);
    return this.speakup.teamReply(ctx, id, dto.body);
  }

  // Batch F item 13 (answer 2578): the committee, for its own members only (others: 404).
  @Get('ic')
  icCommittee(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.speakup.icCommittee(ctx);
  }

  @Get('setup')
  @RequirePermissions('speakup.setup.manage')
  setup(@CurrentTenant() ctx: TenantContext) {
    return this.speakup.setup(ctx);
  }

  @Post('setup/members')
  @RequirePermissions('speakup.setup.manage')
  addMember(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TeamMemberDto) {
    assertOwnSession(req);
    return this.speakup.addMember(ctx, dto);
  }

  @Post('setup/members/:id/remove')
  @RequirePermissions('speakup.setup.manage')
  removeMember(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.speakup.removeMember(ctx, id);
  }
}

/** No login: anonymous reports and "check my report". Nothing here reads or keeps who is asking. */
@Controller('desk/speakup/public')
export class PublicSpeakupController {
  constructor(private readonly speakup: SpeakupService) {}

  @Get('company/:org')
  @Throttle(PUBLIC_API_THROTTLE)
  company(@Param('org') org: string) {
    return this.speakup.company(org.slice(0, 80));
  }

  @Post('reports')
  @Throttle(STRICT_AUTH_THROTTLE)
  file(@Body() dto: AnonymousReportDto) {
    return this.speakup.fileAnonymous(dto);
  }

  @Post('check')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  check(@Req() req: Request, @Body() dto: CodeDto) {
    return this.speakup.check(dto.org, dto.code, req.ip ?? null);
  }

  @Post('check/reply')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  reply(@Req() req: Request, @Body() dto: ReplyDto) {
    return this.speakup.reply(dto.org, dto.code, dto.body, req.ip ?? null);
  }

  @Post('check/files')
  @Throttle(STRICT_AUTH_THROTTLE)
  @UseInterceptors(UPLOAD)
  addFile(@Req() req: Request, @Body() dto: CodeDto, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.speakup.addAnonymousFile(dto.org, dto.code, file ? { name: file.originalname, data: file.buffer } : null, req.ip ?? null);
  }
}
