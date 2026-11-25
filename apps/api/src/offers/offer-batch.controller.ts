import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { OfferBatchService } from './offer-batch.service';
import { OfferBatchDto } from './dto/offer-batch.dto';

// HIR-28 bulk offers. Recruiting (ats.offer.manage or pipeline:manage) with the offer-pay key (checked in the service);
// sending is refused while acting for someone else and rate-limited (each row is a real offer and an email).
@Controller('hiring/offer-batches')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OfferBatchController {
  constructor(private readonly batches: OfferBatchService) {}

  @Get('setup')
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  setup(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query('jobId', ParseUUIDPipe) jobId: string) {
    return this.batches.setup(ctx, req.user as ScopeUser, jobId);
  }

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  send(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: OfferBatchDto) {
    assertOwnSession(req);
    return this.batches.send(ctx, req.user as ScopeUser, dto);
  }

  @Get(':id')
  @RequireAnyPermission('ats.offer.manage', 'pipeline:manage')
  read(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.batches.read(ctx, req.user as ScopeUser, id);
  }
}
