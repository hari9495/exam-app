import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import type { ScopeUser } from '../access/scope';
import { AdvanceAmountDto, AdvanceDto, AdvanceListDto, BookingDto, CloseTripDto, PartnerBookingDto, PayAdvanceDto, ReturnDto, TripDto, TripListDto, VersionDto } from './trips-dto';
import { ExpenseTripsService } from './trips.service';

// Expenses batch E4 (M05-BUILD-DESIGN §18 "Trips", "Advances"). Every route is open to the implicit grants (the
// traveller; the approver whose task it is); the service decides per record. Paying and returns need
// expense.payout.manage (step-up like payroll keys, §16.3). Decisions go through the P03 inbox.
const FILE = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

@Controller('expenses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseTripsController {
  constructor(private readonly trips: ExpenseTripsService) {}

  private user(req: Request) {
    return req.user as ScopeUser;
  }

  @Get('trips')
  list(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: TripListDto) {
    return this.trips.listTrips(ctx, this.user(req), q.view);
  }

  @Post('trips')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: TripDto) {
    return this.trips.createTrip(ctx, this.user(req), dto);
  }

  @Get('trips/:id')
  get(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.getTrip(ctx, this.user(req), id);
  }

  @Put('trips/:id')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TripDto) {
    return this.trips.updateTrip(ctx, this.user(req), id, dto);
  }

  @Post('trips/:id/submit')
  @HttpCode(200)
  submit(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VersionDto) {
    return this.trips.submitTrip(ctx, this.user(req), id, dto.version);
  }

  @Post('trips/:id/cancel')
  @HttpCode(200)
  cancel(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.cancelTrip(ctx, this.user(req), id);
  }

  @Post('trips/:id/close')
  @HttpCode(200)
  @RequirePermissions('travel.booking.manage')
  close(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseTripDto) {
    return this.trips.closeTrip(ctx, this.user(req), id, dto);
  }

  @Post('trips/:id/bookings')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(FILE)
  addBooking(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BookingDto, @UploadedFile() file?: Express.Multer.File) {
    return this.trips.addBooking(ctx, this.user(req), id, dto, file);
  }

  @Post('trips/:id/bookings/partner')
  @HttpCode(200)
  partner(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PartnerBookingDto) {
    return this.trips.partnerBook(ctx, this.user(req), id, dto.legSeq);
  }

  @Delete('trips/:id/bookings/:bookingId')
  removeBooking(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    return this.trips.removeBooking(ctx, this.user(req), id, bookingId);
  }

  @Get('trips/:id/bookings/:bookingId/file')
  async bookingFile(@Req() req: Request, @Res({ passthrough: true }) res: Response, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('bookingId', ParseUUIDPipe) bookingId: string) {
    const out = await this.trips.bookingFile(ctx, this.user(req), id, bookingId);
    res.set({
      'Content-Type': out.contentType,
      'Content-Disposition': `inline; filename="${out.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; sandbox",
    });
    return new StreamableFile(out.file);
  }

  @Get('advances')
  advances(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: AdvanceListDto) {
    return this.trips.listAdvances(ctx, this.user(req), q.view);
  }

  @Post('advances')
  request(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AdvanceDto) {
    return this.trips.requestAdvance(ctx, this.user(req), dto);
  }

  @Get('advances/:id')
  advance(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.trips.getAdvance(ctx, this.user(req), id);
  }

  @Patch('advances/:id/amount')
  amount(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AdvanceAmountDto) {
    return this.trips.changeAmount(ctx, this.user(req), id, dto);
  }

  @Post('advances/:id/pay')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  pay(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: PayAdvanceDto) {
    return this.trips.pay(ctx, this.user(req), id, dto);
  }

  @Post('advances/:id/return')
  @HttpCode(200)
  @RequirePermissions('expense.payout.manage')
  giveBack(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnDto) {
    return this.trips.recordReturn(ctx, this.user(req), id, dto);
  }
}
