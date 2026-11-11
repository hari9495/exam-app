import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import type { Request, Response } from 'express';
import { TenantContext } from '@exam-platform/shared';
import type { ScopeUser } from '../access/scope';
import { assertOwnSession } from '../service-desk/desk-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { ContractLabourService } from './contract-labour.service';
import { AttendanceConfirmDto, AttendanceReopenDto, RegistrationDto, DirectPaymentDto, DiscrepancyDto, HoldReleaseDto, MinWageQueryDto, MonthQueryDto, ProofDecisionDto, ApproveWorkerDto, ContractorContactDto, ContractorDto, LicenceDto, RejectLicenceDto, ReleaseWorkerDto, RenewalDto, SaveClraSettingsDto, WorkerDto, WorkOrderDto } from './clra-dto';
import { WorkersService } from './workers.service';
import { ContractAttendanceService } from './attendance.service';
import { ComplianceService } from './compliance.service';

const who = (req: Request) => req.user as ScopeUser;
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const upload = (f: Express.Multer.File | undefined) => (f ? { name: f.originalname, data: f.buffer } : null);
const READ = ['clra.contractor.manage', 'clra.contractor.view'] as const;

// Contract labour CL-1 (CLB-01 contractors register, Settings 4.9). The service checks the keys for the whole company
// and refuses writes while acting for someone else; another company's records read as not found.
@Controller('contract-labour')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractLabourController {
  constructor(
    private readonly svc: ContractLabourService,
    private readonly workers: WorkersService,
    private readonly compliance: ComplianceService,
    private readonly attendance: ContractAttendanceService,
  ) {}

  /* ---------------- CL-5 attendance, gate pass, photo, kiosk PIN, registrations ---------------- */

  @Get('attendance')
  @RequireAnyPermission(...READ)
  attendanceMonth(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.attendance.month(ctx, who(req), q.month);
  }

  @Post('attendance/confirm')
  @RequireAnyPermission('clra.contractor.manage')
  confirmAttendance(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AttendanceConfirmDto) {
    assertOwnSession(req);
    return this.attendance.confirm(ctx, who(req), dto);
  }

  /** Answer 753: reopen a confirmed month (the compliance owner, with a reason). */
  @Post('attendance/reopen')
  @RequireAnyPermission('clra.contractor.manage')
  reopenAttendance(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: AttendanceReopenDto) {
    assertOwnSession(req);
    return this.attendance.reopen(ctx, who(req), dto);
  }

  @Post('workers/:id/gate-pass')
  @RequireAnyPermission('clra.contractor.manage')
  renewPass(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveWorkerDto) {
    assertOwnSession(req);
    return this.workers.renewPass(ctx, who(req), id, dto);
  }

  @Post('workers/:id/kiosk-pin')
  @RequireAnyPermission('clra.contractor.manage')
  kioskPin(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.workers.setKioskPin(ctx, who(req), id);
  }

  @Post('workers/:id/photo')
  @RequireAnyPermission('clra.contractor.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  setPhoto(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.workers.setPhoto(ctx, who(req), id, upload(file));
  }

  @Get('workers/:id/photo')
  @RequireAnyPermission(...READ)
  async photo(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.workers.photo(ctx, who(req), id);
    res.set({ 'Content-Type': f.contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }

  @Post('registrations')
  @RequireAnyPermission('clra.settings.manage', 'org.settings.manage')
  addRegistration(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: RegistrationDto) {
    assertOwnSession(req);
    return this.svc.saveRegistration(ctx, who(req), null, dto);
  }

  @Put('registrations/:id')
  @RequireAnyPermission('clra.settings.manage', 'org.settings.manage')
  changeRegistration(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RegistrationDto) {
    assertOwnSession(req);
    return this.svc.saveRegistration(ctx, who(req), id, dto);
  }

  @Post('registrations/:id/remove')
  @RequireAnyPermission('clra.settings.manage', 'org.settings.manage')
  removeRegistration(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.svc.removeRegistration(ctx, who(req), id);
  }

  /* ---------------- CL-4 vendor compliance (CLB-03) ---------------- */

  @Get('compliance')
  @RequireAnyPermission(...READ)
  tracker(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MonthQueryDto) {
    return this.compliance.tracker(ctx, who(req), q.month);
  }

  @Post('compliance/proofs/:id/verify')
  @RequireAnyPermission('clra.contractor.manage')
  verifyProof(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ProofDecisionDto) {
    assertOwnSession(req);
    return this.compliance.verify(ctx, who(req), id, dto.version);
  }

  @Post('compliance/proofs/:id/discrepancy')
  @RequireAnyPermission('clra.contractor.manage')
  proofDiscrepancy(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DiscrepancyDto) {
    assertOwnSession(req);
    return this.compliance.discrepancy(ctx, who(req), id, dto.version, dto.note);
  }

  @Get('compliance/proofs/:id/file')
  @RequireAnyPermission(...READ)
  async proofFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.compliance.itemFile(ctx, who(req), id);
    res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }

  @Post('compliance/holds/release')
  @RequireAnyPermission('clra.contractor.manage')
  releaseHold(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: HoldReleaseDto) {
    assertOwnSession(req);
    return this.compliance.release(ctx, who(req), dto);
  }

  @Post('compliance/direct-payments')
  @RequireAnyPermission('clra.contractor.manage')
  directPayment(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: DirectPaymentDto) {
    assertOwnSession(req);
    return this.compliance.directPayment(ctx, who(req), dto);
  }

  @Get('min-wage')
  @RequireAnyPermission(...READ)
  minWage(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: MinWageQueryDto) {
    return this.compliance.minWageHint(ctx, who(req), q.locationId, q.skill, q.on);
  }

  /* ---------------- CL-2 contract workers (CLB-02) ---------------- */

  @Get('workers')
  @RequireAnyPermission(...READ)
  listWorkers(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.workers.list(ctx, who(req));
  }

  @Post('workers/check')
  @RequireAnyPermission('clra.contractor.manage')
  checkWorker(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WorkerDto) {
    assertOwnSession(req);
    return this.workers.check(ctx, who(req), dto);
  }

  @Post('workers')
  @RequireAnyPermission('clra.contractor.manage')
  createWorker(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: WorkerDto) {
    assertOwnSession(req);
    return this.workers.create(ctx, who(req), dto);
  }

  @Post('workers/:id/approve')
  @RequireAnyPermission('clra.contractor.manage')
  approveWorker(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveWorkerDto) {
    assertOwnSession(req);
    return this.workers.approve(ctx, who(req), id, dto);
  }

  @Post('workers/:id/release')
  @RequireAnyPermission('clra.contractor.manage')
  releaseWorker(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReleaseWorkerDto) {
    assertOwnSession(req);
    return this.workers.release(ctx, who(req), id, dto);
  }


  @Get('contractors')
  @RequireAnyPermission(...READ)
  register(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.register(ctx, who(req));
  }

  @Post('contractors')
  @RequireAnyPermission('clra.contractor.manage')
  create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: ContractorDto) {
    assertOwnSession(req);
    return this.svc.createContractor(ctx, who(req), dto);
  }

  @Put('contractors/:id')
  @RequireAnyPermission('clra.contractor.manage')
  update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContractorDto) {
    assertOwnSession(req);
    return this.svc.updateContractor(ctx, who(req), id, dto);
  }

  @Post('contractors/:id/contacts')
  @RequireAnyPermission('clra.contractor.manage')
  addContact(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ContractorContactDto) {
    assertOwnSession(req);
    return this.svc.addContact(ctx, who(req), id, dto);
  }

  @Post('contractors/:id/contacts/:contactId/remove')
  @RequireAnyPermission('clra.contractor.manage')
  removeContact(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('contactId', ParseUUIDPipe) contactId: string) {
    assertOwnSession(req);
    return this.svc.removeContact(ctx, who(req), id, contactId);
  }

  @Post('contractors/:id/work-orders')
  @RequireAnyPermission('clra.contractor.manage')
  addWorkOrder(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: WorkOrderDto) {
    assertOwnSession(req);
    return this.svc.saveWorkOrder(ctx, who(req), id, null, dto);
  }

  @Put('contractors/:id/work-orders/:orderId')
  @RequireAnyPermission('clra.contractor.manage')
  changeWorkOrder(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('orderId', ParseUUIDPipe) orderId: string, @Body() dto: WorkOrderDto) {
    assertOwnSession(req);
    return this.svc.saveWorkOrder(ctx, who(req), id, orderId, dto);
  }

  @Post('contractors/:id/licences')
  @RequireAnyPermission('clra.contractor.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  addLicence(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LicenceDto, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.svc.addLicence(ctx, who(req), id, dto, upload(file));
  }

  @Post('licences/:id/renewal')
  @RequireAnyPermission('clra.contractor.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  renew(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RenewalDto, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    return this.svc.renew(ctx, who(req), id, dto, upload(file));
  }

  @Post('licences/:id/verify')
  @RequireAnyPermission('clra.contractor.manage')
  verify(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.svc.verify(ctx, who(req), id);
  }

  @Post('licences/:id/reject')
  @RequireAnyPermission('clra.contractor.manage')
  reject(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectLicenceDto) {
    assertOwnSession(req);
    return this.svc.reject(ctx, who(req), id, dto.reason);
  }

  @Get('licences/:id/file')
  @RequireAnyPermission(...READ)
  async file(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const f = await this.svc.file(ctx, who(req), id);
    res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `attachment; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
    return new StreamableFile(f.file);
  }

  @Get('settings')
  @RequireAnyPermission(...READ, 'clra.settings.manage', 'org.settings.manage')
  settings(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.readSettings(ctx, who(req));
  }

  @Put('settings')
  @RequireAnyPermission('clra.settings.manage', 'org.settings.manage')
  saveSettings(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: SaveClraSettingsDto) {
    assertOwnSession(req);
    return this.svc.saveSettings(ctx, who(req), dto.changes);
  }
}
