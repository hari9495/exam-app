import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import type { ScopeUser } from '../access/scope';
import { HomeRemindersService } from './home-reminders.service';

// T2-E 51 (answer 2874): the signed-in person's own Home reminder cards (no key: only their own windows and requests).
@Controller('notifications/home-reminders')
@UseGuards(JwtAuthGuard)
export class HomeRemindersController {
  constructor(private readonly reminders: HomeRemindersService) {}

  @Get()
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.reminders.mine(ctx, req.user as ScopeUser);
  }
}
