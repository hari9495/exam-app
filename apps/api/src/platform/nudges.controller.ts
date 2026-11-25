import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { OrgScopeService } from '../access/org-scope.service';
import { PlatformStaffGuard } from './platform-staff.guard';
import { NudgesService } from './nudges.service';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
const PLAIN = { message: 'Write it without < or >.' };

/** YX-12: the copy for one feature switch (sent for approval). */
export class NudgeDto {
  @IsString() @MaxLength(60) featureKey!: string;
  @IsIn(['suggest', 'switch_on']) kind!: 'suggest' | 'switch_on';
  @trim() @IsString() @MinLength(3) @MaxLength(80) @Matches(/^[^<>]*$/, PLAIN) heading!: string;
  @trim() @IsString() @MinLength(10) @MaxLength(300) @Matches(/^[^<>]*$/, PLAIN) body!: string;
}

export class NudgeReviewDto {
  @IsBoolean() approve!: boolean;
  @IsOptional() @trim() @IsString() @MaxLength(300) note?: string;
}

// YukthiX console C-8, YX-12: staff only, on their own platform session with their security key, every route behind the
// nudges key (staff role: Customer success, answers 1058 and 1086).
@Controller('platform/nudges')
@UseGuards(JwtAuthGuard, PlatformStaffGuard, PermissionsGuard)
export class NudgesController {
  constructor(private readonly nudges: NudgesService) {}

  @Get()
  @RequirePermissions('platform.nudges.write')
  overview(@CurrentUserId() actor: string) {
    return this.nudges.overview(actor);
  }

  @Post()
  @RequirePermissions('platform.nudges.write')
  write(@CurrentUserId() actor: string, @Body() dto: NudgeDto) {
    return this.nudges.write(actor, dto);
  }

  @Post(':id/review')
  @HttpCode(200)
  @RequirePermissions('platform.nudges.write')
  review(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NudgeReviewDto) {
    return this.nudges.review(actor, id, dto);
  }

  @Post(':id/retire')
  @HttpCode(200)
  @RequirePermissions('platform.nudges.write')
  retire(@CurrentUserId() actor: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.nudges.retire(actor, id);
  }
}

type NudgeUser = { userId?: string; organizationId?: string | null; actingSuperAdmin?: boolean };

/** YX-12, the company side: the one nudge for the signed-in person (or null), and Not now. No key: everyone may ask. */
@Controller('help/nudge')
@UseGuards(JwtAuthGuard)
export class MyNudgeController {
  constructor(
    private readonly nudges: NudgesService,
    private readonly scope: OrgScopeService,
  ) {}

  @Get()
  async mine(@Req() req: Request) {
    const u = req.user as NudgeUser;
    const canAct = async (keys: string[]) => {
      for (const k of keys) if ((await this.scope.reach(req, k)) !== 'all') return false;
      return true;
    };
    return { nudge: await this.nudges.mine({ organizationId: u.organizationId ?? null, userId: u.userId ?? null, actingSuperAdmin: u.actingSuperAdmin }, canAct) };
  }

  @Post(':id/dismiss')
  @HttpCode(200)
  dismiss(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const u = req.user as NudgeUser;
    return this.nudges.dismiss({ organizationId: u.organizationId ?? null, userId: u.userId ?? null }, id);
  }
}
