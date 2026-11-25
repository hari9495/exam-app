import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { TenantContext } from '@exam-platform/shared';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { assertOwnSession } from '../service-desk/desk-access';
import type { ScopeUser } from '../access/scope';
import { CourseDto, DecideDto, DeclineDto, FileItemDto, NominateDto, PeopleQueryDto } from './dto';
import { CoursesService } from './courses.service';

// Batch G3a (M07) Learning. Keys (P02 YX-SEC-01):
//   learning.manage   build and publish courses, decide enrolment requests, nominate anyone (whole company)
//   no key            the catalogue and my own learning; a manager nominates their own direct reports (checked in
//                     the service); writing is never done while acting for someone else
const UPLOAD = FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 } });
const out = (res: Response, f: { file: Buffer; name: string; contentType: string }) => {
  res.set({ 'Content-Type': f.contentType, 'Content-Disposition': `inline; filename="${f.name.replace(/[^A-Za-z0-9._-]/g, '_')}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
  return new StreamableFile(f.file);
};

@Controller('learning/courses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CoursesController {
  constructor(private readonly svc: CoursesService) {}

  private async gate(req: Request) {
    if (!(await this.svc.companyWide(req.user as ScopeUser))) throw new ForbiddenException('Courses cover the whole company: this needs the key for the whole company.');
  }

  @Get()
  @RequirePermissions('learning.manage')
  async list(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.gate(req);
    return this.svc.list(ctx);
  }

  @Get('skills')
  @RequirePermissions('learning.manage')
  async skills(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    await this.gate(req);
    return this.svc.skillOptions(ctx);
  }

  @Post()
  @RequirePermissions('learning.manage')
  async create(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Body() dto: CourseDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.svc.create(ctx, dto);
  }

  @Get(':id')
  @RequirePermissions('learning.manage')
  async detail(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    await this.gate(req);
    return this.svc.detail(ctx, id);
  }

  @Put(':id')
  @RequirePermissions('learning.manage')
  async update(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CourseDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.svc.update(ctx, id, dto);
  }

  @Post(':id/files')
  @RequirePermissions('learning.manage')
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  @UseInterceptors(UPLOAD)
  async addFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: FileItemDto, @UploadedFile() file: Express.Multer.File | undefined) {
    assertOwnSession(req);
    await this.gate(req);
    return this.svc.addFile(ctx, id, dto, file ? { name: file.originalname, data: file.buffer } : null);
  }

  @Post(':id/publish')
  @RequirePermissions('learning.manage')
  async publish(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    await this.gate(req);
    return this.svc.publish(ctx, id);
  }

  @Post('enrolments/:id/decide')
  @RequirePermissions('learning.manage')
  async decide(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideDto) {
    assertOwnSession(req);
    await this.gate(req);
    return this.svc.decide(ctx, id, dto.approve, dto.reason);
  }
}

@Controller('learning/my')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MyLearningController {
  constructor(private readonly svc: CoursesService) {}

  @Get()
  mine(@Req() req: Request, @CurrentTenant() ctx: TenantContext) {
    return this.svc.mine(ctx, req.user as ScopeUser);
  }

  @Post('courses/:id/enrol')
  enrol(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    assertOwnSession(req);
    return this.svc.enrol(ctx, req.user as ScopeUser, id);
  }

  @Get('enrolments/:id')
  player(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.player(ctx, req.user as ScopeUser, id);
  }

  @Post('enrolments/:id/items/:itemId/done')
  done(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string) {
    assertOwnSession(req);
    return this.svc.done(ctx, req.user as ScopeUser, id, itemId);
  }

  @Get('enrolments/:id/items/:itemId/file')
  async itemFile(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('itemId', ParseUUIDPipe) itemId: string, @Res({ passthrough: true }) res: Response) {
    return out(res, await this.svc.itemFile(ctx, req.user as ScopeUser, id, itemId));
  }

  @Post('enrolments/:id/decline')
  decline(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclineDto) {
    assertOwnSession(req);
    return this.svc.decline(ctx, req.user as ScopeUser, id, dto.reason);
  }

  // A manager nominates their own direct reports; L&D anyone (checked in the service).
  @Get('nominate/people')
  people(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Query() q: PeopleQueryDto) {
    return this.svc.people(ctx, req.user as ScopeUser, q.q);
  }

  @Post('courses/:id/nominate')
  nominate(@Req() req: Request, @CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: NominateDto) {
    assertOwnSession(req);
    return this.svc.nominate(ctx, req.user as ScopeUser, id, dto.userIds, dto.dueOn);
  }
}
