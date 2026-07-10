import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
  aiGenerate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: AiGenerateQuestionsDto) {
    return this.questionsService.aiGenerate(tenant, userId, dto);
  }

  @Get()
  @RequirePermissions('question_bank:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('topic') topic?: string,
    @Query('difficulty') difficulty?: string,
    @Query('status') status?: string,
    @Query('tagId') tagId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.questionsService.list(tenant, { topic, difficulty, status, tagId, limit: limit ? parseInt(limit, 10) : undefined, cursor });
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
