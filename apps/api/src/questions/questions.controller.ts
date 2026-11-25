import { Body, Controller, Get, Param, Patch, Post, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { OwnSessionChangesGuard } from '../auth/own-session.guard';
import { RequirePermissions, RequireAnyPermission } from '../rbac/permissions.decorator';
import { SeesAnswerKeys, ShowsAnswerKeys, withoutAnswerKey } from '../rbac/answer-keys';
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
// AS-0 (answer 2006): no assessments change while acting for someone else.
@UseGuards(JwtAuthGuard, OwnSessionChangesGuard, PermissionsGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  // Answer 2141: a new question is a draft nobody can use until another person approves it in the question bank, as the
  // bank's own New question does (answer 2009).
  @Post()
  @RequirePermissions('question_bank:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(tenant, userId, dto, { status: 'draft' });
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
  @RequireAnyPermission('question_bank:manage', 'question_bank:view')
  @ShowsAnswerKeys()
  async list(
    @SeesAnswerKeys() keys: boolean,
    @CurrentTenant() tenant: TenantContext,
    @Query('topic') topic?: string,
    @Query('difficulty') difficulty?: string,
    @Query('status') status?: string,
    @Query('tagId') tagId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    const page_ = await this.questionsService.list(tenant, { topic, difficulty, status, tagId, page, pageSize, search });
    // A reader of the bank (question_bank:view) sees the questions without their answer keys (security fix).
    return keys ? page_ : { ...page_, data: page_.data.map(withoutAnswerKey) };
  }

  @Get('code-languages')
  @RequireAnyPermission('question_bank:manage', 'question_bank:view')
  listCodeLanguages() {
    return this.questionsService.listAvailableLanguages();
  }

  @Get(':id')
  @RequireAnyPermission('question_bank:manage', 'question_bank:view')
  @ShowsAnswerKeys()
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @SeesAnswerKeys() keys: boolean) {
    const q = await this.questionsService.findOne(tenant, id);
    return keys ? q : withoutAnswerKey(q);
  }

  @Patch(':id')
  @RequirePermissions('question_bank:manage')
  update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(tenant, userId, id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('question_bank:manage')
  archive(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.questionsService.archive(tenant, userId, id);
  }

  @Post(':id/publish')
  @RequirePermissions('question_bank:manage')
  publish(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.questionsService.publish(tenant, userId, id);
  }
}
