import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE, STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { BindRequestDto, FaceConsentDto, PhonePunchDto, PhoneSyncDto, PinDto, ReasonDto, RegisterKioskDto, TrainingPeopleQueryDto, TrainingSessionDto, TrainingSessionEditDto, WebApprovalDto } from './devices.dto';
import { DevicesService } from './devices.service';

// TIM-14 Devices and kiosks (HR) and the person's own devices (TIM-12 phone, TIM-13 kiosk PIN / card / face).
//   leave.settings.manage (company-wide, checked again in TimeSetupService.run)  /time/devices, kiosks/*, phones/*, people/*
//   no key: the signed-in person only, never while acting for someone else       /time/devices/me/*
@Controller('time/devices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  // ------------------------------------------------------------------------------------------ HR

  @Get()
  @RequirePermissions('leave.settings.manage')
  overview(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.devices.overview(ctx, this.user(req));
  }

  @Get('training')
  @RequirePermissions('leave.settings.manage')
  training(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.devices.trainingSessions(ctx, this.user(req));
  }

  @Post('training')
  @RequirePermissions('leave.settings.manage')
  addTraining(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TrainingSessionDto) {
    return this.devices.addTrainingSession(ctx, this.user(req), dto);
  }

  @Get('training/people')
  @RequirePermissions('leave.settings.manage')
  trainingPeople(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: TrainingPeopleQueryDto) {
    return this.devices.trainingPeople(ctx, this.user(req), q.q ?? '');
  }

  @Put('training/:id')
  @RequirePermissions('leave.settings.manage')
  editTraining(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TrainingSessionEditDto) {
    return this.devices.editTrainingSession(ctx, this.user(req), id, dto);
  }

  @Post('training/:id/cancel')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  cancelTraining(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.cancelTrainingSession(ctx, this.user(req), id);
  }

  @Post('kiosks')
  @RequirePermissions('leave.settings.manage')
  register(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RegisterKioskDto) {
    return this.devices.registerKiosk(ctx, this.user(req), dto);
  }

  @Post('kiosks/:id/reset')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  reset(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.resetKiosk(ctx, this.user(req), id);
  }

  @Post('kiosks/:id/revoke')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  revoke(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.revokeKiosk(ctx, this.user(req), id);
  }

  @Post('phones/:id/approve')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  approve(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.approveBind(ctx, this.user(req), id);
  }

  @Post('phones/:id/refuse')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  refuse(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto) {
    return this.devices.refuseBind(ctx, this.user(req), id, dto.reason);
  }

  @Post('phones/:id/sign-out')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  signOut(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.signOutPhone(ctx, this.user(req), id);
  }

  /** Founder answer 1: the web clock-in rule for the company, a legal entity or a location (audited as a control change). */
  @Put('web-approval')
  @RequirePermissions('leave.settings.manage')
  setWebApproval(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WebApprovalDto) {
    return this.devices.setWebApproval(ctx, this.user(req), dto);
  }

  /** A legal entity's or location's own value removed: it follows the value above it again. */
  @Post('web-approval/:id/remove')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  removeWebApproval(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.devices.removeWebApproval(ctx, this.user(req), id);
  }

  @Post('people/:employeeId/pin-reset')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  pinReset(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) id: string) {
    return this.devices.resetPin(ctx, this.user(req), id);
  }

  @Post('people/:employeeId/qr')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  cardQr(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) id: string) {
    return this.devices.cardQr(ctx, this.user(req), id);
  }

  @Post('people/:employeeId/qr-rotate')
  @HttpCode(200)
  @RequirePermissions('leave.settings.manage')
  rotateQr(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('employeeId', ParseUUIDPipe) id: string) {
    return this.devices.rotateQr(ctx, this.user(req), id);
  }

  // ------------------------------------------------------------------------------------------ me

  @Get('me')
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.devices.mine(ctx, this.user(req));
  }

  @Post('me/bind')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  bind(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: BindRequestDto) {
    return this.devices.requestBind(ctx, this.user(req), dto);
  }

  @Post('me/bind/withdraw')
  @HttpCode(200)
  withdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.devices.withdrawBind(ctx, this.user(req));
  }

  @Post('me/pin')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  pin(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PinDto) {
    return this.devices.setPin(ctx, this.user(req), dto.pin);
  }

  @Get('me/qr')
  myQr(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.devices.myQr(ctx, this.user(req));
  }

  @Post('me/face')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  face(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: FaceConsentDto) {
    return this.devices.giveFaceConsent(ctx, this.user(req), dto);
  }

  @Post('me/face/withdraw')
  @HttpCode(200)
  faceWithdraw(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.devices.withdrawFaceConsent(ctx, this.user(req));
  }

  @Post('me/punch')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  punch(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PhonePunchDto) {
    return this.devices.phonePunch(ctx, this.user(req), dto, req.ip ?? null, (req.headers['user-agent'] as string | undefined) ?? null);
  }

  @Post('me/sync')
  @HttpCode(200)
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  sync(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: PhoneSyncDto) {
    return this.devices.phoneSync(ctx, this.user(req), dto, req.ip ?? null, (req.headers['user-agent'] as string | undefined) ?? null);
  }
}
