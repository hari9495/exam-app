import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { AiGenerateQuestionsDto } from './dto/ai-generate-questions.dto';
import { STRICT_AI_GENERATE_THROTTLE, MODERATE_UPLOAD_THROTTLE } from '../rate-limit-tiers';
import { generateBulkUploadTemplate } from './bulk-upload-template';

@Controller('questions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @RequirePermissions('question_bank:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(tenant, userId, dto);
  }

  @Post('ai-generate')
  @RequirePermissions('question_bank:manage')
  @Throttle(STRICT_AI_GENERATE_THROTTLE)
  aiGenerate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: AiGenerateQuestionsDto) {
    return this.questionsService.aiGenerate(tenant, userId, dto);
  }

  @Post('bulk-upload')
  @RequirePermissions('question_bank:manage')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  bulkUpload(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @UploadedFile() file: Express.Multer.File) {
    return this.questionsService.bulkUpload(tenant, userId, file);
  }

  @Post('images')
  @RequirePermissions('question_bank:manage')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.questionsService.uploadImage(file);
  }

  @Get('bulk-upload/template')
  @RequirePermissions('question_bank:manage')
  async downloadBulkUploadTemplate(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const buffer = await generateBulkUploadTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="question-bulk-upload-template.xlsx"',
    });
    return new StreamableFile(buffer);
  }

  @Get()
  @RequirePermissions('question_bank:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('topic') topic?: string,
    @Query('difficulty') difficulty?: string,
    @Query('status') status?: string,
    @Query('tagId') tagId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.questionsService.list(tenant, { topic, difficulty, status, tagId, page, pageSize, search });
  }

  @Get(':id')
  @RequirePermissions('question_bank:manage')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions('question_bank:manage')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionsService.update(tenant, id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('question_bank:manage')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.archive(tenant, id);
  }

  @Post(':id/publish')
  @RequirePermissions('question_bank:manage')
  publish(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.publish(tenant, id);
  }
}
