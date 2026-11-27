import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
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
import { LearningSessionsService } from './learning-sessions.service';
import { LearningFeedbackService } from './learning-feedback.service';
import { LearningSkillsService } from './learning-skills.service';
import { MAX_ZIP_MB } from './scorm';

export class CourseDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsOptional() @IsIn(['self_paced', 'classroom', 'virtual']) type?: 'self_paced' | 'classroom' | 'virtual';
  @IsOptional() @IsInt() @Min(1) @Max(100) attendancePct?: number;
  /** Answer 2624: completions count in the Internal Committee annual report. */
  @IsOptional() @IsBoolean() poshAwareness?: boolean;
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
  /** Answer 2672: the level each skill gives on completion, in the order of skills. */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsInt({ each: true }) @Min(1, { each: true }) @Max(5, { each: true }) skillLevels?: number[];
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
  @IsIn(['pdf', 'video', 'link', 'scorm']) kind!: 'pdf' | 'video' | 'link' | 'scorm';
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
  /** T2-G 42: the company's groups (any of them). */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) groupIds?: string[];
  @IsInt() @Min(1) @Max(365) dueDays!: number;
  @IsIn([0, 12, 24]) repeatMonths!: 0 | 12 | 24;
  @IsBoolean() active!: boolean;
}

export class RuleUpdateDto extends RuleDto {
  @IsInt() @Min(1) version!: number;
}

/** Answer 2781: one commit of a SCORM package, as the bridge forwards it; the service keeps only the allowed fields. */
export class ScormCommitDto {
  @IsObject() cmi!: Record<string, unknown>;
}

export class EnrolDto {
  @IsOptional() @IsBoolean() acceptBond?: boolean;
  @IsOptional() @IsUUID() sessionId?: string;
}

export class TrainerDto {
  @IsBoolean() external!: boolean;
  @IsOptional() @IsUUID() employeeId?: string | null;
  @IsOptional() @IsString() @MaxLength(200) name?: string | null;
  @IsOptional() @IsString() @MaxLength(200) orgName?: string | null;
  @IsOptional() @IsString() @MaxLength(254) email?: string | null;
}

export class SlotDto {
  @IsISO8601() startsAt!: string;
  @IsISO8601() endsAt!: string;
}

export class CostLineDto {
  @IsString() @MinLength(2) @MaxLength(100) label!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) amount!: number;
}

export class SessionDto {
  @IsUUID() courseId!: string;
  @IsIn(['classroom', 'virtual']) mode!: 'classroom' | 'virtual';
  @IsString() @MinLength(3) @MaxLength(300) venue!: string;
  @IsUUID() trainerId!: string;
  @IsInt() @Min(1) @Max(500) seats!: number;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SlotDto) slots!: SlotDto[];
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CostLineDto) costLines!: CostLineDto[];
}

export class SessionUpdateDto {
  @IsOptional() @IsIn(['classroom', 'virtual']) mode?: 'classroom' | 'virtual';
  @IsOptional() @IsString() @MinLength(3) @MaxLength(300) venue?: string;
  @IsOptional() @IsUUID() trainerId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(500) seats?: number;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SlotDto) slots?: SlotDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => CostLineDto) costLines?: CostLineDto[];
  @IsOptional() @IsBoolean() cancel?: boolean;
  @IsInt() @Min(1) version!: number;
}

export class VersionDto {
  @IsInt() @Min(1) version!: number;
}

export class WithdrawDto {
  @IsUUID() enrolmentId!: string;
}

export class NominateDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('all', { each: true }) employeeIds!: string[];
}

export class MarkDto {
  @IsUUID() enrolmentId!: string;
  @IsIn(['present', 'late', 'absent']) status!: 'present' | 'late' | 'absent';
}

export class MarksDto {
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => MarkDto) marks!: MarkDto[];
}

export class ReactionDto {
  @IsInt() @Min(1) @Max(5) overall!: number;
  @IsInt() @Min(1) @Max(5) trainer!: number;
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class TrainingCheckDto {
  @IsIn(['yes', 'partly', 'no', 'early']) applying!: 'yes' | 'partly' | 'no' | 'early';
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class DecideSkillDto {
  @IsBoolean() confirm!: boolean;
}

export class AssessDto {
  @IsUUID() skillId!: string;
  @IsInt() @Min(1) @Max(5) level!: number;
}

export class OwnSkillDto {
  @IsUUID() skillId!: string;
  @IsInt() @Min(1) @Max(5) level!: number;
  @IsOptional() @IsString() @MaxLength(200) note?: string;
}

export class TeamNeedDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsUUID() skillId?: string;
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsIn(['high', 'medium', 'low']) priority!: string;
}

export class NeedDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() skillId?: string;
  @IsIn(['skill_gap', 'manager', 'compliance', 'review']) source!: string;
  @IsIn(['high', 'medium', 'low']) priority!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) estCost!: number;
}

export class NeedsUpdateDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids!: string[];
  @IsIn(['new', 'planned', 'in_progress', 'closed']) status!: 'new' | 'planned' | 'in_progress' | 'closed';
  @IsOptional() @IsUUID() courseId?: string;
}

export class BudgetDto {
  @IsUUID() departmentId!: string;
  @IsInt() @Min(2000) @Max(2100) year!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000_000) amount!: number;
}

export class BudgetQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(2000) @Max(2100) year?: number;
}

export class CheckInDto {
  @IsUUID() sessionId!: string;
  @IsUUID() slotId!: string;
  @Matches(/^\d{6}$/) code!: string;
  @IsIn(['qr', 'code']) via!: 'qr' | 'code';
}

export class DeclineDto {
  @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class ExternalDto {
  @IsString() @MinLength(3) @MaxLength(200) title!: string;
  @IsString() @MinLength(2) @MaxLength(200) provider!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000) cost!: number;
  @IsString() @MinLength(10) @MaxLength(2000) reason!: string;
  @IsOptional() @IsBoolean() acceptBond?: boolean;
}

export class EntityQueryDto {
  @IsOptional() @IsUUID() entityId?: string;
}

// Items: PDFs (20 MB), videos (100 MB) and SCORM zips (the company's limit, at most MAX_ZIP_MB); the service checks each.
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_ZIP_MB * 1024 * 1024, files: 1 } });
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
    private readonly sessions: LearningSessionsService,
    private readonly feedback: LearningFeedbackService,
    private readonly skills: LearningSkillsService,
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
  enrol(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrolDto) {
    ownSession(req);
    return this.learning.enrol(ctx, id, dto);
  }

  @Get('me/roles')
  roles(@CurrentTenant() ctx: TenantContext) {
    return this.sessions.roles(ctx);
  }

  @Post('me/external')
  external(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ExternalDto) {
    ownSession(req);
    return this.learning.external(ctx, dto);
  }

  @Get('enrolments/:id')
  player(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    // The page's origin: a SCORM package may be framed by it and send its progress to it (answer 2781).
    return this.learning.player(ctx, id, typeof req.headers.origin === 'string' ? req.headers.origin : undefined);
  }

  @Post('enrolments/:id/items/:itemId/scorm')
  @HttpCode(200)
  scormSave(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Body() dto: ScormCommitDto) {
    ownSession(req);
    return this.learning.scormSave(ctx, id, itemId, dto.cmi);
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

  // ---- sessions, trainers, nominations, attendance (LRN-04, 05, 06)

  @Get('trainers')
  @RequirePermissions('learning.manage')
  trainers(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.sessions.trainers(ctx, this.user(req));
  }

  @Post('trainers')
  @RequirePermissions('learning.manage')
  addTrainer(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TrainerDto) {
    ownSession(req);
    return this.sessions.addTrainer(ctx, this.user(req), dto);
  }

  @Get('sessions')
  sessionList(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.sessions.list(ctx, this.user(req));
  }

  @Post('sessions')
  @RequirePermissions('learning.manage')
  schedule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SessionDto) {
    ownSession(req);
    return this.sessions.create(ctx, this.user(req), dto);
  }

  @Get('courses/:id/sessions')
  upcoming(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.sessions.upcoming(ctx, id);
  }

  @Get('sessions/:id')
  async sessionPage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const page = await this.sessions.page(ctx, this.user(req), id);
    return { ...page, feedback: await this.feedback.summaryOf(ctx, id) };
  }

  @Patch('sessions/:id')
  @RequirePermissions('learning.manage')
  reschedule(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SessionUpdateDto) {
    ownSession(req);
    return this.sessions.update(ctx, this.user(req), id, dto);
  }

  @Post('sessions/:id/withdraw')
  @HttpCode(200)
  @RequirePermissions('learning.manage')
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawDto) {
    ownSession(req);
    return this.sessions.withdraw(ctx, this.user(req), id, dto.enrolmentId);
  }

  @Post('sessions/:id/nominate')
  @HttpCode(200)
  nominate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NominateDto) {
    ownSession(req);
    return this.sessions.nominate(ctx, this.user(req), id, dto.employeeIds);
  }

  @Get('sessions/:id/slots/:slotId/code')
  checkinCode(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('slotId', ParseUUIDPipe) slotId: string) {
    return this.sessions.checkinCode(ctx, this.user(req), id, slotId);
  }

  @Post('sessions/:id/slots/:slotId/close')
  @HttpCode(200)
  closeCheckin(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('slotId', ParseUUIDPipe) slotId: string) {
    ownSession(req);
    return this.sessions.closeCheckin(ctx, this.user(req), id, slotId);
  }

  @Post('sessions/:id/slots/:slotId/attendance')
  @HttpCode(200)
  mark(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('slotId', ParseUUIDPipe) slotId: string, @Body() dto: MarksDto) {
    ownSession(req);
    return this.sessions.mark(ctx, this.user(req), id, slotId, dto.marks);
  }

  @Post('sessions/:id/confirm')
  @HttpCode(200)
  @RequirePermissions('learning.manage')
  async confirm(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    ownSession(req);
    const out = await this.sessions.confirm(ctx, this.user(req), id, dto.version);
    await this.feedback.askRatings(ctx, id);
    return out;
  }

  // ---- G3d: skills (LRN-09, 10, 15): the person, their manager chain or L&D, decided per record; needs and budgets (LRN-11)

  @Get('skills/me')
  mySkills(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.skills.profile(ctx, this.user(req), 'me');
  }

  @Get('skills/team')
  teamSkills(@CurrentTenant() ctx: TenantContext) {
    return this.skills.team(ctx);
  }

  // Answer 2673: add a skill to my own profile; my manager confirms it.
  @Post('skills/me')
  addOwnSkill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OwnSkillDto) {
    ownSession(req);
    return this.skills.addOwn(ctx, this.user(req), dto);
  }

  // Answer 2675: a manager raises a training need for someone in their team (checked per person: 404 or 403 otherwise).
  @Post('skills/team/needs')
  raiseTeamNeed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TeamNeedDto) {
    ownSession(req);
    return this.skills.raiseNeed(ctx, this.user(req), dto);
  }

  @Get('skills/people/:employeeId')
  personSkills(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string) {
    return this.skills.profile(ctx, this.user(req), employeeId);
  }

  @Post('skills/people/:employeeId/assess')
  @HttpCode(200)
  assessSkill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) employeeId: string, @Body() dto: AssessDto) {
    ownSession(req);
    return this.skills.assess(ctx, this.user(req), employeeId, dto);
  }

  @Post('skills/suggestions/:id')
  @HttpCode(200)
  decideSkill(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideSkillDto) {
    ownSession(req);
    return this.skills.decide(ctx, this.user(req), id, dto.confirm);
  }

  @Get('needs')
  @RequirePermissions('learning.manage')
  needs(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.skills.needs(ctx, this.user(req));
  }

  @Post('needs')
  @RequirePermissions('learning.manage')
  addNeed(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: NeedDto) {
    ownSession(req);
    return this.skills.addNeed(ctx, this.user(req), dto);
  }

  @Patch('needs')
  @RequirePermissions('learning.manage')
  updateNeeds(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: NeedsUpdateDto) {
    ownSession(req);
    return this.skills.updateNeeds(ctx, this.user(req), dto);
  }

  @Get('budgets')
  @RequirePermissions('learning.manage')
  budgets(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: BudgetQueryDto) {
    return this.skills.budgets(ctx, this.user(req), q.year);
  }

  // Answer 2676: the budgets export.
  @Get('budgets/export')
  @RequirePermissions('learning.manage')
  async budgetsExport(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Query() q: BudgetQueryDto) {
    const out = await this.skills.budgetsCsv(ctx, this.user(req), q.year);
    download(res, 'text/csv; charset=utf-8', `training-budgets-FY${out.year}.csv`);
    return out.csv;
  }

  @Post('budgets')
  @HttpCode(200)
  @RequirePermissions('learning.manage')
  setBudget(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BudgetDto) {
    ownSession(req);
    return this.skills.setBudget(ctx, this.user(req), dto);
  }

  // ---- LRN-12: rating a confirmed session (once), and the manager's later training check (once per person)

  @Get('feedback/due')
  feedbackDue(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.feedback.due(ctx, this.user(req));
  }

  @Post('sessions/:id/reaction')
  @HttpCode(200)
  react(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReactionDto) {
    ownSession(req);
    return this.feedback.react(ctx, this.user(req), id, dto);
  }

  @Get('checks')
  checks(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.feedback.checks(ctx, this.user(req));
  }

  @Post('checks/:enrolmentId')
  @HttpCode(200)
  check(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('enrolmentId', ParseUUIDPipe) enrolmentId: string, @Body() dto: TrainingCheckDto) {
    ownSession(req);
    return this.feedback.check(ctx, this.user(req), enrolmentId, dto);
  }

  @Post('check-in')
  @HttpCode(200)
  checkIn(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CheckInDto) {
    ownSession(req);
    return this.sessions.checkIn(ctx, dto);
  }

  @Post('enrolments/:id/decline')
  @HttpCode(200)
  decline(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclineDto) {
    ownSession(req);
    return this.sessions.decline(ctx, id, dto.reason);
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
