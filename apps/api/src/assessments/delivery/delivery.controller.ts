import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { OwnSessionChangesGuard } from '../../auth/own-session.guard';
import { CurrentTenant } from '../../auth/current-tenant.decorator';
import { CurrentUserId } from '../../auth/current-user-id.decorator';
import { PermissionsGuard } from '../../rbac/permissions.guard';
import { RequirePermissions } from '../../rbac/permissions.decorator';
import { DeliveryService } from './delivery.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class InvitationsQueryDto {
  @IsOptional()
  @IsUUID()
  examId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsIn(['Invited', 'Started', 'Completed', 'Under review', 'Missed', 'Revoked', 'Reused'])
  status?: 'Invited' | 'Started' | 'Completed' | 'Under review' | 'Missed' | 'Revoked' | 'Reused';
}

export class ReinviteDto {
  @trim()
  @IsString()
  @MinLength(10, { message: 'Give a reason of at least 10 characters.' })
  @MaxLength(500)
  reason!: string;
}

// Assessments AS-3 (PRC-07): the people who invite candidates (candidate:manage, as the existing invitation routes; the
// YukthiX ats.candidate.manage answers for it). No change while acting for someone else (AS-0, answer 2006).
@Controller('asmt')
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('invitations')
  @RequirePermissions('candidate:manage')
  list(@CurrentTenant() ctx: TenantContext, @Query() q: InvitationsQueryDto) {
    return this.delivery.invitationsList(ctx, q);
  }

  @Get('drives')
  @RequirePermissions('candidate:manage')
  drives(@CurrentTenant() ctx: TenantContext) {
    return this.delivery.drives(ctx);
  }

  @Post('invitations/:id/reinvite')
  @HttpCode(200)
  @RequirePermissions('candidate:manage')
  reinvite(@CurrentTenant() ctx: TenantContext, @CurrentUserId() userId: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReinviteDto) {
    return this.delivery.reinvite(ctx, userId, id, dto.reason);
  }
}
