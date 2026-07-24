import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions, RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { CreateExamSectionDto } from './dto/create-exam-section.dto';
import { UpdateExamSectionDto } from './dto/update-exam-section.dto';
import { ReplaceSectionQuestionsDto } from './dto/replace-section-questions.dto';

@Controller('exams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  @RequirePermissions('exam:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateExamDto) {
    return this.examsService.create(tenant, userId, dto);
  }

  @Get()
  @RequireAnyPermission('exam:manage', 'results:view')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.examsService.list(tenant, { status, page, pageSize, search });
  }

  @Get(':id')
  @RequireAnyPermission('exam:manage', 'results:view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions('exam:manage')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateExamDto) {
    return this.examsService.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('exam:manage')
  archive(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.examsService.archive(tenant, userId, id);
  }

  @Post(':id/publish')
  @RequirePermissions('exam:manage')
  publish(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.examsService.publish(tenant, userId, id);
  }

  @Post(':id/duplicate')
  @RequirePermissions('exam:manage')
  duplicate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.examsService.duplicate(tenant, userId, id);
  }

  @Post(':id/sections')
  @RequirePermissions('exam:manage')
  createSection(@CurrentTenant() tenant: TenantContext, @Param('id') examId: string, @Body() dto: CreateExamSectionDto) {
    return this.examsService.createSection(tenant, examId, dto);
  }

  @Patch(':id/sections/:sectionId')
  @RequirePermissions('exam:manage')
  updateSection(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') examId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateExamSectionDto,
  ) {
    return this.examsService.updateSection(tenant, examId, sectionId, dto);
  }

  @Delete(':id/sections/:sectionId')
  @RequirePermissions('exam:manage')
  deleteSection(@CurrentTenant() tenant: TenantContext, @Param('id') examId: string, @Param('sectionId') sectionId: string) {
    return this.examsService.deleteSection(tenant, examId, sectionId);
  }

  @Post(':id/sections/:sectionId/duplicate')
  @RequirePermissions('exam:manage')
  duplicateSection(@CurrentTenant() tenant: TenantContext, @Param('id') examId: string, @Param('sectionId') sectionId: string) {
    return this.examsService.duplicateSection(tenant, examId, sectionId);
  }

  @Put(':id/sections/:sectionId/questions')
  @RequirePermissions('exam:manage')
  replaceSectionQuestions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') examId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: ReplaceSectionQuestionsDto,
  ) {
    return this.examsService.replaceSectionQuestions(tenant, examId, sectionId, dto.questionIds);
  }

  @Get(':id/results')
  @RequirePermissions('results:view')
  getResults(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.getResults(tenant, id);
  }

  @Get(':id/pending-grading')
  @RequirePermissions('exam:manage')
  getPendingGrading(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.getPendingGrading(tenant, id);
  }
}
