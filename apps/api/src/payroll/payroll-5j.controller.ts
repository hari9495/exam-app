import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission, RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { GoLiveService } from './golive.service';
import { PayStructuresService } from './structures.service';

// Payroll batch 5j (M03 §17.10): the salary split suggestion (PAY-10.06), the parallel run and the go-live readiness page
// (PAY-10.07). Every route declares its key (YX-SEC-01); the services check the legal entities again.
//   employee.salary.manage    suggest a split for a CTC (nothing is kept)
//   payroll.run.prepare       upload the old payroll's register for a run
//   payroll.run.approve       sign the comparison off or waive it (never one's own upload)
//   payroll.run.prepare / payroll.setup.manage   the readiness page

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class SuggestDto {
  @IsUUID()
  employeeId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveDate!: string;

  @Matches(/^(?!0+(\.0+)?$)\d{1,12}(\.\d{1,2})?$/)
  annualCtc!: string;
}

export class ParallelDecisionDto {
  @IsIn(['signed_off', 'waived'])
  decision!: 'signed_off' | 'waived';

  @IsOptional()
  @trim()
  @IsString()
  @Length(5, 300)
  reason?: string;
}

export class EntityQueryDto {
  @IsUUID()
  entityId!: string;
}

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class Payroll5jController {
  constructor(
    private readonly golive: GoLiveService,
    private readonly structures: PayStructuresService,
  ) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Post('compensations/suggest')
  @HttpCode(200)
  @RequirePermissions('employee.salary.manage')
  suggest(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SuggestDto) {
    return this.structures.suggest(ctx, this.user(req), dto);
  }

  @Post('runs/:id/parallel')
  @RequirePermissions('payroll.run.prepare')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  parallel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: { buffer: Buffer }) {
    return this.golive.upload(ctx, this.user(req), id, file?.buffer);
  }

  @Get('parallel-runs')
  @RequireAnyPermission('payroll.run.prepare', 'payroll.run.approve')
  parallelRuns(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.golive.list(ctx, this.user(req), q.entityId);
  }

  @Post('parallel-runs/:id/decision')
  @HttpCode(200)
  @RequirePermissions('payroll.run.approve')
  decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ParallelDecisionDto) {
    return this.golive.decide(ctx, this.user(req), id, dto.decision, dto.reason ?? null);
  }

  @Get('go-live')
  @RequireAnyPermission('payroll.run.prepare', 'payroll.setup.manage')
  readiness(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: EntityQueryDto) {
    return this.golive.readiness(ctx, this.user(req), q.entityId);
  }
}
