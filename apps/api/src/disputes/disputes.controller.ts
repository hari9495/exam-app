import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { assertOwnSession } from '../service-desk/desk-access';
import { CloseDto, DemandDto, DemandUpdateDto, DisputeDto, FiledDto, MeetingDto, PaperDto, ReasonDto, SettlementDto } from './dto';
import { DisputesService } from './disputes.service';

// HLP-13 collective disputes (rules: docs/yukthix/helpdesk-design-map.md section 4h). No key: being on the industrial
// relations team (a speak-up list only the System Admin keeps) is the access; everyone else gets 404 (the list is empty
// for them). Every route is the person's own act, so all of them are refused (403) while acting for someone else.
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const id = new ParseUUIDPipe();

@Controller('desk/disputes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.disputes.list(ctx);
  }

  @Get('form')
  form(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.disputes.form(ctx);
  }

  @Post()
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DisputeDto) {
    assertOwnSession(req);
    return this.disputes.create(ctx, dto);
  }

  @Get(':id')
  detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string) {
    assertOwnSession(req);
    return this.disputes.detail(ctx, disputeId);
  }

  @Post(':id/demands')
  demand(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Body() dto: DemandDto) {
    assertOwnSession(req);
    return this.disputes.addDemand(ctx, disputeId, dto);
  }

  @Post(':id/demands/:demandId')
  updateDemand(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Param('demandId', id) demandId: string, @Body() dto: DemandUpdateDto) {
    assertOwnSession(req);
    return this.disputes.updateDemand(ctx, disputeId, demandId, dto);
  }

  @Post(':id/meetings')
  meeting(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Body() dto: MeetingDto) {
    assertOwnSession(req);
    return this.disputes.meeting(ctx, disputeId, dto);
  }

  @Post(':id/papers')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  paper(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Body() dto: PaperDto, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.disputes.addPaper(ctx, disputeId, dto.title, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get(':id/files/:fileId')
  async file(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Param('fileId', id) fileId: string, @Res({ passthrough: true }) res: Response) {
    assertOwnSession(req);
    const f = await this.disputes.file(ctx, disputeId, fileId);
    res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }

  @Post(':id/settlement')
  propose(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Body() dto: SettlementDto) {
    assertOwnSession(req);
    return this.disputes.propose(ctx, disputeId, dto);
  }

  @Post(':id/settlement/approve')
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string) {
    assertOwnSession(req);
    return this.disputes.approve(ctx, disputeId);
  }

  @Post(':id/settlement/send-back')
  sendBack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Body() dto: ReasonDto) {
    assertOwnSession(req);
    return this.disputes.sendBack(ctx, disputeId, dto.reason);
  }

  @Post(':id/filed')
  filed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Body() dto: FiledDto) {
    assertOwnSession(req);
    return this.disputes.filed(ctx, disputeId, dto);
  }

  @Post(':id/close')
  close(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) disputeId: string, @Body() dto: CloseDto) {
    assertOwnSession(req);
    return this.disputes.close(ctx, disputeId, dto);
  }
}
