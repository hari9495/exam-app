import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { QuestionAiService } from './question-ai.service';
import { SuggestTagsDto, GenerateDistractorsDto } from './dto/question-ai.dto';

@Controller('questions/ai')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuestionAiController {
  constructor(private readonly questionAi: QuestionAiService) {}

  @Post('tags')
  @RequirePermissions('question_bank:manage')
  suggestTags(@CurrentTenant() tenant: TenantContext, @Body() dto: SuggestTagsDto) {
    return this.questionAi.suggestTags(tenant, dto);
  }

  @Post('distractors')
  @RequirePermissions('question_bank:manage')
  distractors(@CurrentTenant() tenant: TenantContext, @Body() dto: GenerateDistractorsDto) {
    return this.questionAi.generateDistractors(tenant, dto);
  }
}
