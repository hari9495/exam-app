import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ACCOMMODATION_KINDS, EXTRA_TIME_PERCENTS, TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../../rbac/permissions.decorator';
import { BeforeTestService } from './before-test.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class ListQueryDto {
  @IsOptional()
  @IsIn(['pending', 'decided'])
  status?: 'pending' | 'decided';
}

export class DecideAccommodationDto {
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn(ACCOMMODATION_KINDS, { each: true })
  approvedKinds!: string[];

  @IsOptional()
  @IsIn(EXTRA_TIME_PERCENTS)
  extraTimePercent?: number | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  message?: string | null;
}

export class ConnectivityDecisionDto {
  @trim()
  @IsString()
  @MinLength(10, { message: 'Give a reason of at least 10 characters (it is kept in the audit log).' })
  @MaxLength(1000)
  reason!: string;
}

// Assessments AS-4b (answer 2011). Accommodations (PRC-11) are decided by test writers (asmt.test.manage, alias
// exam:manage); evaluators and proctors never see the reason or the evidence. Connectivity above the cap (PRC-10) by
// test writers or proctors. No change while acting for someone else (AS-0, answer 2006).
@Controller('asmt')
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class BeforeTestController {
  constructor(private readonly svc: BeforeTestService) {}

  @Get('accommodations')
  @RequirePermissions('exam:manage')
  accommodations(@CurrentTenant() ctx: TenantContext, @Query() q: ListQueryDto) {
    return this.svc.accommodations(ctx, q.status ?? 'pending');
  }

  @Get('accommodations/:id/evidence')
  @RequirePermissions('exam:manage')
  evidence(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.evidence(ctx, userId, id);
  }

  @Post('accommodations/:id/decide')
  @HttpCode(200)
  @RequirePermissions('exam:manage')
  decide(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideAccommodationDto) {
    return this.svc.decide(ctx, userId, id, dto);
  }

  @Get('connectivity')
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  connectivity(@CurrentTenant() ctx: TenantContext, @Query() q: ListQueryDto) {
    return this.svc.connectivity(ctx, q.status ?? 'pending');
  }

  @Post('connectivity/:id/approve')
  @HttpCode(200)
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  approve(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConnectivityDecisionDto) {
    return this.svc.decideConnectivity(ctx, userId, id, true, dto.reason);
  }

  @Post('connectivity/:id/decline')
  @HttpCode(200)
  @RequireAnyPermission('exam:manage', 'asmt.proctor')
  decline(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConnectivityDecisionDto) {
    return this.svc.decideConnectivity(ctx, userId, id, false, dto.reason);
  }
}
