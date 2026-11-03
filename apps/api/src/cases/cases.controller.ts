import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { RequirePermissions } from '../rbac/permissions.decorator';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { AddMemberDto, DelayDto, IcReportDto, MessageDto, MoreTimeDecisionDto, NoticeDto, ProposeDto, RaiseDto, ReasonDto, ReliefDto, ReplyDto, SendBackDto, SeverityDto, VersionDto, VoteDto } from './dto';
import { CasesService } from './cases.service';

// HLP-07/08/09 cases (rules: docs/yukthix/helpdesk-design-map.md section 4f). No key: being a member of the case is the
// access (404 otherwise, for HR, managers and admins alike), and "My cases" is the person's own part. Every route is the
// person's own act, so it is refused (403) while acting for someone else.
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const id = new ParseUUIDPipe();
const out = (res: Response, f: { file: Buffer; name: string; contentType: string }) => {
  res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  return new StreamableFile(f.file);
};

@Controller('desk/cases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.cases.list(ctx);
  }

  /** HLP-08 answer 34: HR opens a disciplinary show-cause case (case.disciplinary.raise; the key is granted company-wide only). */
  @Get('disciplinary/people')
  @RequirePermissions('case.disciplinary.raise')
  raiseOptions(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.cases.raiseOptions(ctx, req.user as ScopeUser);
  }

  @Post('disciplinary')
  @RequirePermissions('case.disciplinary.raise')
  raise(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RaiseDto) {
    assertOwnSession(req);
    return this.cases.raise(ctx, req.user as ScopeUser, dto);
  }

  @Get(':id')
  detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string) {
    assertOwnSession(req);
    return this.cases.detail(ctx, caseId);
  }

  @Post(':id/messages')
  message(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: MessageDto) {
    assertOwnSession(req);
    return this.cases.message(ctx, caseId, dto.body);
  }

  @Post(':id/notice')
  notice(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: NoticeDto) {
    assertOwnSession(req);
    return this.cases.sendNotice(ctx, caseId, dto);
  }

  @Post(':id/notice/delay')
  delay(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: DelayDto) {
    assertOwnSession(req);
    return this.cases.delayNotice(ctx, caseId, dto);
  }

  @Post(':id/more-time')
  moreTime(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: MoreTimeDecisionDto) {
    assertOwnSession(req);
    return this.cases.decideMoreTime(ctx, caseId, dto);
  }

  @Post(':id/outcome')
  propose(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: ProposeDto) {
    assertOwnSession(req);
    return this.cases.propose(ctx, caseId, dto);
  }

  @Post(':id/outcome/approve')
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.cases.approve(ctx, caseId, dto.version);
  }

  @Post(':id/outcome/send-back')
  sendBack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: SendBackDto) {
    assertOwnSession(req);
    return this.cases.sendBack(ctx, caseId, dto);
  }

  @Post(':id/ic-report')
  icReport(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: IcReportDto) {
    assertOwnSession(req);
    return this.cases.saveIcReport(ctx, caseId, dto);
  }

  @Post(':id/ic-report/vote')
  vote(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: VoteDto) {
    assertOwnSession(req);
    return this.cases.vote(ctx, caseId, dto);
  }

  @Post(':id/ic-report/sign')
  sign(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: VersionDto) {
    assertOwnSession(req);
    return this.cases.sign(ctx, caseId, dto.version);
  }

  @Post(':id/relief')
  relief(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: ReliefDto) {
    assertOwnSession(req);
    return this.cases.relief(ctx, caseId, dto);
  }

  @Post(':id/relief/:reliefId/done')
  reliefDone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Param('reliefId', id) reliefId: string) {
    assertOwnSession(req);
    return this.cases.reliefDone(ctx, caseId, reliefId);
  }

  @Post(':id/recuse')
  recuse(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: ReasonDto) {
    assertOwnSession(req);
    return this.cases.recuse(ctx, caseId, dto.reason);
  }

  @Post(':id/members')
  addMember(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: AddMemberDto) {
    assertOwnSession(req);
    return this.cases.addMember(ctx, caseId, dto);
  }

  @Post(':id/files')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  upload(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.cases.upload(ctx, caseId, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get(':id/files/:fileId')
  async file(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Param('fileId', id) fileId: string, @Res({ passthrough: true }) res: Response) {
    assertOwnSession(req);
    return out(res, await this.cases.file(ctx, caseId, fileId));
  }
}

@Controller('desk/ethics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EthicsController {
  constructor(private readonly cases: CasesService) {}

  @Get('reports')
  reports(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.cases.ethics(ctx);
  }

  @Post('reports/:id/severity')
  @HttpCode(200)
  severity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: SeverityDto) {
    assertOwnSession(req);
    return this.cases.setSeverity(ctx, caseId, dto.severity);
  }

  @Post('reports/:id/route')
  @HttpCode(200)
  route(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: ReasonDto) {
    assertOwnSession(req);
    return this.cases.routeToChair(ctx, caseId, dto.reason);
  }
}

@Controller('desk/my/cases')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MyCasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.cases.myList(ctx);
  }

  @Get(':id')
  one(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string) {
    assertOwnSession(req);
    return this.cases.myDetail(ctx, caseId);
  }

  @Post(':id/messages')
  message(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: MessageDto) {
    assertOwnSession(req);
    return this.cases.myMessage(ctx, caseId, dto.body);
  }

  @Post(':id/reply')
  reply(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: ReplyDto) {
    assertOwnSession(req);
    return this.cases.reply(ctx, caseId, dto);
  }

  @Post(':id/more-time')
  moreTime(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: ReasonDto) {
    assertOwnSession(req);
    return this.cases.askMoreTime(ctx, caseId, dto.reason);
  }

  @Post(':id/files')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  upload(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.cases.myUpload(ctx, caseId, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get(':id/files/:fileId')
  async file(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Param('fileId', id) fileId: string, @Res({ passthrough: true }) res: Response) {
    assertOwnSession(req);
    return out(res, await this.cases.myFile(ctx, caseId, fileId));
  }
}
