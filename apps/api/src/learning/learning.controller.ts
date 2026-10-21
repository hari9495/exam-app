import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import type { ScopeUser } from '../access/scope';
import { LearningService } from './learning.service';
import { LearningAssignService } from './learning-assign.service';
import { LearningReportsService } from './learning-reports.service';

export class CourseDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @IsIn(['company', 'provider', 'partner']) source!: 'company' | 'provider' | 'partner';
  @IsOptional() @IsString() @MaxLength(120) provider?: string | null;
  @IsInt() @Min(0) @Max(100_000) durationMinutes!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) cost!: number;
  @IsBoolean() mandatory!: boolean;
  @IsBoolean() needsApproval!: boolean;
  @IsBoolean() certificate!: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(120) certificateMonths?: number | null;
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(80, { each: true }) skills!: string[];
}

export class CourseUpdateDto extends CourseDto {
  @IsInt() @Min(1) version!: number;
}

export class CourseStatusDto {
  @IsIn(['published', 'retired']) status!: 'published' | 'retired';
  @IsInt() @Min(1) version!: number;
}

// Multipart for files, so numbers and booleans arrive as text.
const toInt = ({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
export class ItemDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsIn(['pdf', 'video', 'link']) kind!: 'pdf' | 'video' | 'link';
  @Transform(toInt) @IsInt() @Min(0) @Max(1440) minutes!: number;
  @Transform(toBool) @IsBoolean() required!: boolean;
  @IsOptional() @IsString() @MaxLength(1000) url?: string | null;
}

export class ItemUpdateDto {
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1440) minutes?: number;
  @IsOptional() @IsIn(['up', 'down']) move?: 'up' | 'down';
}

export class RuleDto {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
  @IsUUID() courseId!: string;
  @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) legalEntityIds!: string[];
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) locationIds!: string[];
  @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) departmentIds!: string[];
  @IsOptional() @IsString() @MaxLength(120) designation?: string | null;
  @IsInt() @Min(1) @Max(365) dueDays!: number;
  @IsIn([0, 12, 24]) repeatMonths!: 0 | 12 | 24;
  @IsBoolean() active!: boolean;
}

export class RuleUpdateDto extends RuleDto {
  @IsInt() @Min(1) version!: number;
}

export class EntityQueryDto {
  @IsOptional() @IsUUID() entityId?: string;
}

const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } });
const download = (res: Response, mime: string, name: string, inline = false) =>
  res.set({
    'Content-Type': mime,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name.replace(/[^A-Za-z0-9._ -]/g, '_')}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  });

// Learning (LRN-01, 02, 03, 07, 08; PPL-03 Learning tab). learning.manage for courses and rules, learning.report.view
// for compliance; the rest is the person's own learning, their manager's team view or their record, which the
// services decide per record.
@Controller('learning')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly assign: LearningAssignService,
    private readonly reports: LearningReportsService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ---- the learner

  @Get('me')
  me(@CurrentTenant() ctx: TenantContext) {
    return this.learning.me(ctx);
  }

  @Post('courses/:id/enrol')
  enrol(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    return this.learning.enrol(ctx, id);
  }

  @Get('enrolments/:id')
  player(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.player(ctx, id);
  }

  @Post('enrolments/:id/items/:itemId/done')
  @HttpCode(200)
  markDone(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    ownSession(req);
    return this.learning.markDone(ctx, id, itemId);
  }

  @Get('items/:itemId/file')
  async itemFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('itemId', ParseUUIDPipe) itemId: string) {
    const out = await this.learning.itemFile(ctx, this.user(req), itemId);
    download(res, out.mime, out.name, true);
    return new StreamableFile(out.data);
  }

  @Get('certificates/:id/pdf')
  async certificatePdf(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const out = await this.learning.certificatePdf(ctx, this.user(req), id);
    download(res, 'application/pdf', out.name);
    return new StreamableFile(out.data);
  }

  @Get('team')
  team(@CurrentTenant() ctx: TenantContext) {
    return this.reports.team(ctx);
  }

  @Get('people/:employeeId')
  person(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.reports.person(ctx, this.user(req), employeeId);
  }

  // ---- L&D: courses (LRN-03)

  @Get('admin/courses')
  @RequirePermissions('learning.manage')
  courses(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.learning.courses(ctx, this.user(req));
  }

  @Get('admin/courses/:id')
  @RequirePermissions('learning.manage')
  course(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.course(ctx, this.user(req), id);
  }

  @Post('admin/courses')
  @RequirePermissions('learning.manage')
  createCourse(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CourseDto) {
    ownSession(req);
    return this.learning.createCourse(ctx, this.user(req), dto);
  }

  @Patch('admin/courses/:id')
  @RequirePermissions('learning.manage')
  updateCourse(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CourseUpdateDto) {
    ownSession(req);
    return this.learning.updateCourse(ctx, this.user(req), id, dto);
  }

  @Post('admin/courses/:id/status')
  @HttpCode(200)
  @RequirePermissions('learning.manage')
  setStatus(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CourseStatusDto) {
    ownSession(req);
    return this.learning.setStatus(ctx, this.user(req), id, dto.status, dto.version);
  }

  @Post('admin/courses/:id/items')
  @RequirePermissions('learning.manage')
  @UseInterceptors(UPLOAD)
  addItem(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ItemDto, @UploadedFile() file?: Express.Multer.File) {
    ownSession(req);
    return this.learning.addItem(ctx, this.user(req), id, dto, file);
  }

  @Patch('admin/courses/:id/items/:itemId')
  @RequirePermissions('learning.manage')
  updateItem(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: ItemUpdateDto) {
    ownSession(req);
    return this.learning.updateItem(ctx, this.user(req), id, itemId, dto);
  }

  @Delete('admin/courses/:id/items/:itemId')
  @RequirePermissions('learning.manage')
  removeItem(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    ownSession(req);
    return this.learning.removeItem(ctx, this.user(req), id, itemId);
  }

  // ---- L&D: assignment rules (LRN-07)

  @Get('rules')
  @RequirePermissions('learning.manage')
  rules(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.assign.list(ctx, this.user(req));
  }

  @Post('rules/preview')
  @HttpCode(200)
  @RequirePermissions('learning.manage')
  preview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RuleDto) {
    return this.assign.preview(ctx, this.user(req), dto);
  }

  @Post('rules')
  @RequirePermissions('learning.manage')
  createRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RuleDto) {
    ownSession(req);
    return this.assign.create(ctx, this.user(req), dto);
  }

  @Patch('rules/:id')
  @RequirePermissions('learning.manage')
  updateRule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleUpdateDto) {
    ownSession(req);
    return this.assign.update(ctx, this.user(req), id, dto);
  }

  // ---- compliance (LRN-08)

  @Get('compliance')
  @RequirePermissions('learning.report.view')
  compliance(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.reports.compliance(ctx, this.user(req), q.entityId ?? null);
  }

  @Post('compliance/remind')
  @HttpCode(200)
  @RequirePermissions('learning.report.view')
  remind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    ownSession(req);
    return this.reports.remindOverdue(ctx, this.user(req), q.entityId ?? null);
  }

  @Get('compliance/export')
  @RequirePermissions('learning.report.view')
  async exportCsv(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    const csv = await this.reports.exportCsv(ctx, this.user(req), q.entityId ?? null);
    download(res, 'text/csv; charset=utf-8', `compliance-training-${new Date().toISOString().slice(0, 10)}.csv`);
    return csv;
  }
}
