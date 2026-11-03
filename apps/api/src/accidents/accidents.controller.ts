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
import { EcDto, EcPaidDto, FactsDto, FiledDto, MedicalDto, ReportAccidentDto, StatementDto } from './dto';
import { AccidentsService } from './accidents.service';

// HLP-12 accident cases (rules: docs/yukthix/helpdesk-design-map.md section 4g). No key: anyone signed in reports;
// being on the safety team (a speak-up list only the System Admin keeps) or the case's named handler is the access to a
// case, the injured employee's manager sees leave dates only, and everyone else gets 404. Every route is the person's
// own act, so all of them are refused (403) while acting for someone else (founder decision 2).
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const id = new ParseUUIDPipe();

@Controller('desk/accidents')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccidentsController {
  constructor(private readonly accidents: AccidentsService) {}

  @Get('form')
  form(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.accidents.form(ctx);
  }

  @Post()
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  report(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ReportAccidentDto) {
    assertOwnSession(req);
    return this.accidents.report(ctx, dto);
  }

  @Get()
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    assertOwnSession(req);
    return this.accidents.list(ctx);
  }

  @Get(':id')
  detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string) {
    assertOwnSession(req);
    return this.accidents.detail(ctx, caseId);
  }

  @Get(':id/esic-form')
  esicForm(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string) {
    assertOwnSession(req);
    return this.accidents.esicForm(ctx, caseId);
  }

  @Post(':id/photos')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  photo(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.accidents.addPhoto(ctx, caseId, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Post(':id/facts')
  facts(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: FactsDto) {
    assertOwnSession(req);
    return this.accidents.facts(ctx, caseId, dto);
  }

  @Post(':id/statements')
  statement(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: StatementDto) {
    assertOwnSession(req);
    return this.accidents.statement(ctx, caseId, dto);
  }

  @Post(':id/esic-filed')
  esicFiled(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: FiledDto) {
    assertOwnSession(req);
    return this.accidents.esicFiled(ctx, caseId, dto);
  }

  @Post(':id/contractor-filed')
  contractorFiled(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: FiledDto) {
    assertOwnSession(req);
    return this.accidents.contractorFiled(ctx, caseId, dto);
  }

  @Post(':id/ec')
  ec(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: EcDto) {
    assertOwnSession(req);
    return this.accidents.ec(ctx, caseId, dto);
  }

  @Post(':id/ec-paid')
  ecPaid(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: EcPaidDto) {
    assertOwnSession(req);
    return this.accidents.ecPaid(ctx, caseId, dto);
  }

  @Post(':id/medical')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  medical(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Body() dto: MedicalDto, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.accidents.addMedical(ctx, caseId, dto, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Get(':id/files/:fileId')
  async file(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string, @Param('fileId', id) fileId: string, @Res({ passthrough: true }) res: Response) {
    assertOwnSession(req);
    const f = await this.accidents.file(ctx, caseId, fileId);
    res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }

  @Post(':id/close')
  close(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', id) caseId: string) {
    assertOwnSession(req);
    return this.accidents.close(ctx, caseId);
  }
}
