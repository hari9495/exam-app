import { BadRequestException, Controller, Delete, Get, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CalendarSyncService } from './calendar-sync.service';
import { CalendarNotConfiguredError } from './calendar-oauth-config';

@Controller('calendar')
export class CalendarSyncController {
  constructor(private readonly calendar: CalendarSyncService) {}

  // Personal routes: guarded by JWT only (no permission key) -- they only ever touch the
  // caller's OWN calendar connection, so a panelist can self-connect the same as a recruiter.

  @Get('connections')
  @UseGuards(JwtAuthGuard)
  listConnections(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.calendar.listConnections(tenant, userId);
  }

  @Get(':provider/connect')
  @UseGuards(JwtAuthGuard)
  async connect(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('provider') provider: string,
  ): Promise<{ authUrl: string }> {
    try {
      return await this.calendar.beginConnect(tenant, userId, provider);
    } catch (err) {
      if (err instanceof CalendarNotConfiguredError) {
        throw new BadRequestException('Calendar sync is not available for this provider');
      }
      throw err;
    }
  }

  @Delete(':provider')
  @UseGuards(JwtAuthGuard)
  async disconnect(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('provider') provider: string,
  ): Promise<{ ok: true }> {
    await this.calendar.disconnect(tenant, userId, provider);
    return { ok: true };
  }

  /**
   * OAuth redirect target. Unguarded: the browser lands here after the provider redirect, carrying
   * ?code&state and no JWT. Always redirects back to the settings page -- with ?calendarConnected on
   * success or a generic ?calendarError on any failure (never leaks which step failed).
   */
  @Get(':provider/callback')
  async callback(
    @Param('provider') provider: string,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() _req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const settings = `${frontendUrl}/v2/calendar`;
    if (error || !code || !state) {
      res.redirect(`${settings}?calendarError=denied`);
      return;
    }
    try {
      await this.calendar.handleCallback(provider, code, state);
      res.redirect(`${settings}?calendarConnected=${encodeURIComponent(provider)}`);
    } catch {
      res.redirect(`${settings}?calendarError=failed`);
    }
  }
}
