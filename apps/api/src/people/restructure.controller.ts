import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { RequireStepUp } from '../auth/step-up.decorator';
import { ownSession } from '../org-structure/org-structure.controller';
import { EmployeeHistoryService, RequestUser } from '../employee-history/employee-history.service';
import { RestructureService } from './restructure.service';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const LETTER_TYPE = /^[a-z0-9_]{1,40}$/;

export class MoveOptionsDto {
  @IsIn(['carry', 'lapse']) leave!: 'carry' | 'lapse';
  @IsIn(['keep', 'restart']) service!: 'keep' | 'restart';
  @IsIn(['keep', 'new']) code!: 'keep' | 'new';
  @IsIn(['keep', 'new']) salary!: 'keep' | 'new';
}

export class OverrideDto {
  @IsUUID() employeeId!: string;
  @IsOptional() @IsBoolean() leaveOut?: boolean;
  @IsOptional() @IsIn(['carry', 'lapse']) leave?: 'carry' | 'lapse';
  @IsOptional() @IsIn(['keep', 'restart']) service?: 'keep' | 'restart';
  @IsOptional() @IsIn(['keep', 'new']) code?: 'keep' | 'new';
  @IsOptional() @IsIn(['keep', 'new']) salary?: 'keep' | 'new';
  @IsString() @MinLength(3) @MaxLength(300) reason!: string;
}

export class TargetDto {
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() managerEmployeeId?: string | null;
  @IsOptional() @IsUUID() costCentreId?: string;
  /** One person moving between entities (PPL-04): a new designation in the new entity. */
  @IsOptional() @IsUUID() designationId?: string;
}

export class RestructureDto {
  @IsIn(['merge', 'close', 'demerge', 'within']) kind!: 'merge' | 'close' | 'demerge' | 'within';
  @IsUUID() fromEntityId!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() intoEntityId?: string | null;
  @Matches(DATE) effectiveDate!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) locationIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) departmentIds?: string[];
  /** PPL-04 Change action: only these people move (one person between entities). */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) employeeIds?: string[];
  /** Old location id → new location id (moves between legal entities). */
  @IsOptional() @IsObject() locationMap?: Record<string, string>;
  /** Old master id → master id in the new entity (departments, designations, employment types, grades only for the old entity). */
  @IsOptional() @IsObject() masterMap?: Record<string, string>;
  @IsOptional() @ValidateNested() @Type(() => TargetDto) target?: TargetDto;
  @ValidateNested() @Type(() => MoveOptionsDto) defaults!: MoveOptionsDto;
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => OverrideDto) overrides?: OverrideDto[];
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(500) overrideReason?: string | null;
  /** The letter template for the transfer letters, offered in the bulk issue after approval (letters checks it again). */
  @IsOptional() @IsString() @Matches(LETTER_TYPE) letterType?: string;
  /** The saved draft this plan came from: deleted once the plan is sent. */
  @IsOptional() @IsUUID() draftId?: string;
}

/** The wizard as it was left: every field optional (half filled in), each one the same shape as when sending. */
export class DraftStateDto {
  @IsOptional() @IsIn(['merge', 'close', 'demerge', 'within']) kind?: 'merge' | 'close' | 'demerge' | 'within';
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() fromEntityId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsUUID() intoEntityId?: string | null;
  @IsOptional() @ValidateIf((_, v) => v !== null) @Matches(DATE) effectiveDate?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) locationIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) departmentIds?: string[];
  @IsOptional() @IsObject() locationMap?: Record<string, string>;
  @IsOptional() @IsObject() masterMap?: Record<string, string>;
  @IsOptional() @ValidateNested() @Type(() => TargetDto) target?: TargetDto;
  @IsOptional() @ValidateNested() @Type(() => MoveOptionsDto) defaults?: MoveOptionsDto;
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @ValidateNested({ each: true }) @Type(() => OverrideDto) overrides?: OverrideDto[];
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsString() @Matches(LETTER_TYPE) letterType?: string;
  @IsOptional() @IsIn(['scope', 'options', 'close', 'letters', 'review']) step?: string;
}
export class DraftDto {
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @ValidateNested() @Type(() => DraftStateDto) state!: DraftStateDto;
}

export class DecideDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
export class CloseDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class ContinuityQueryDto {
  @IsUUID() restructureId!: string;
  @IsUUID() employeeId!: string;
}
export class ItemDto {
  @IsBoolean() done!: boolean;
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(300) note?: string | null;
  @IsInt() @Min(1) version!: number;
}

const UUID_MAP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// People › Restructure (PPL-09) and the continuity checklist (PPL-10). Keys, checked again person by person:
//   employee.change.manage    plan, check and send (each person in reach; hiring into the new entity in reach)
//   employee.change.approve   with employee.change.manage (HR, founder decision 21 Oct 2026: payroll does no HR work):
//                             approve or reject, never one's own and never a plan that moves oneself (YX-SEC-11)
//   payroll.run.prepare       payroll of the new entity keeps the continuity checklist too
@Controller('people/restructures')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RestructureController {
  constructor(
    private readonly restructures: RestructureService,
    private readonly history: EmployeeHistoryService,
  ) {}

  private user(req: Request) {
    return req.user as RequestUser;
  }
  private viewer(req: Request) {
    return this.history.viewer(this.user(req));
  }
  private maps(dto: { locationMap?: Record<string, string>; masterMap?: Record<string, string> }) {
    // The location map is a plain object of ids: anything else is refused here.
    for (const [name, m] of [['locationMap', dto.locationMap], ['masterMap', dto.masterMap]] as const) {
      const entries = Object.entries(m ?? {});
      if (entries.length > 400) throw new BadRequestException(`${name} is too long.`);
      for (const [k, v] of entries) if (!UUID_MAP.test(k) || typeof v !== 'string' || !UUID_MAP.test(v)) throw new BadRequestException(`${name} maps ids to ids.`);
    }
  }
  private clean(dto: RestructureDto) {
    this.maps(dto);
    return { ...dto, locationIds: dto.locationIds ?? [], departmentIds: dto.departmentIds ?? [], locationMap: dto.locationMap ?? {}, masterMap: dto.masterMap ?? {}, target: dto.target ?? {}, overrides: dto.overrides ?? [] };
  }

  @Get('setup')
  @RequirePermissions('employee.change.manage')
  async setup(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.restructures.setup(ctx, await this.viewer(req));
  }

  @Get()
  @RequirePermissions('employee.change.manage')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.restructures.list(ctx, await this.viewer(req));
  }

  @Post('preview')
  @HttpCode(200)
  @RequirePermissions('employee.change.manage')
  async preview(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RestructureDto) {
    ownSession(req);
    return this.restructures.preview(ctx, await this.viewer(req), this.clean(dto));
  }

  @Post()
  @RequirePermissions('employee.change.manage')
  async send(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RestructureDto) {
    ownSession(req);
    return this.restructures.send(ctx, await this.viewer(req), this.clean(dto));
  }

  // Saved drafts ("Save and exit"): only the person who saved one sees or changes it; anyone else gets 404.
  @Get('drafts')
  @RequirePermissions('employee.change.manage')
  drafts(@CurrentTenant() ctx: TenantContext) {
    return this.restructures.drafts(ctx);
  }

  @Post('drafts')
  @RequirePermissions('employee.change.manage')
  createDraft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DraftDto) {
    ownSession(req);
    this.maps(dto.state);
    return this.restructures.saveDraft(ctx, null, dto);
  }

  @Get('drafts/:id')
  @RequirePermissions('employee.change.manage')
  draft(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.restructures.draft(ctx, id);
  }

  @Put('drafts/:id')
  @RequirePermissions('employee.change.manage')
  updateDraft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DraftDto) {
    ownSession(req);
    this.maps(dto.state);
    return this.restructures.saveDraft(ctx, id, dto);
  }

  @Delete('drafts/:id')
  @HttpCode(204)
  @RequirePermissions('employee.change.manage')
  async deleteDraft(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    ownSession(req);
    await this.restructures.deleteDraft(ctx, id);
  }

  @Get('continuity')
  @RequireAnyPermission('employee.change.manage', 'payroll.run.prepare')
  async continuity(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: ContinuityQueryDto) {
    return this.restructures.continuity(ctx, await this.viewer(req), this.user(req), q.restructureId, q.employeeId);
  }

  @Put('continuity/:id')
  @RequireAnyPermission('employee.change.manage', 'payroll.run.prepare')
  async item(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ItemDto) {
    ownSession(req);
    return this.restructures.setItem(ctx, await this.viewer(req), this.user(req), id, dto);
  }

  @Get(':id')
  @RequirePermissions('employee.change.manage')
  async get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.restructures.get(ctx, await this.viewer(req), id);
  }

  /** Approving moves many people at once: a fresh second factor, as for bulk changes (P12 YX-IAM-02). */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('employee.change.manage', 'employee.change.approve')
  @RequireStepUp()
  async approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    ownSession(req);
    return this.restructures.approve(ctx, await this.viewer(req), id, dto.note);
  }

  @Post(':id/reject')
  @HttpCode(200)
  @RequirePermissions('employee.change.manage', 'employee.change.approve')
  async reject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseDto) {
    ownSession(req);
    return this.restructures.close(ctx, await this.viewer(req), id, 'rejected', dto.reason);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermissions('employee.change.manage')
  async cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseDto) {
    ownSession(req);
    return this.restructures.close(ctx, await this.viewer(req), id, 'cancelled', dto.reason);
  }
}
