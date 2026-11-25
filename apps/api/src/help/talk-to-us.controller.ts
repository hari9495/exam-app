import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { SalesAssistService } from '../platform/sales-assist.service';
import { TalkToUsDto } from '../platform/sales-assist.controller';
import { SetupHubService } from './setup-hub.service';

/**
 * Founder answer 1210 (C-8, YX-13): Talk to us on a nudge card. The request lands in the YukthiX sales-assist queue for
 * this company and the nudge's feature, with how far set-up is (the set-up hub's checks done, a share only).
 */
@Controller('help/talk-to-us')
@UseGuards(JwtAuthGuard)
export class TalkToUsController {
  constructor(
    private readonly sales: SalesAssistService,
    private readonly hub: SetupHubService,
  ) {}

  @Post()
  @HttpCode(201)
  send(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TalkToUsDto) {
    const u = req.user as { userId?: string; organizationId?: string | null; actingSuperAdmin?: boolean };
    const setupPct = async () => {
      const checks = (await this.hub.hub(ctx)).flatMap((a) => a.checks);
      return checks.length ? Math.round((100 * checks.filter((x) => x.done).length) / checks.length) : null;
    };
    return this.sales.request({ organizationId: u.organizationId ?? null, userId: u.userId ?? null, actingSuperAdmin: u.actingSuperAdmin }, dto, setupPct);
  }
}
