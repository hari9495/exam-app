import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { InterviewAiService } from './interview-ai.service';
import { GenerateInterviewQuestionsDto } from './dto/generate-interview-questions.dto';
import { GenerateScorecardDto } from './dto/generate-scorecard.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InterviewAiController {
  constructor(private readonly interviewAi: InterviewAiService) {}

  // Recruiter prepping an interview kit for a pipeline entry (mirrors the entry-scoped routes).
  @Post('pipeline/entries/:id/interview-questions')
  @RequirePermissions('pipeline:manage')
  generateQuestions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: GenerateInterviewQuestionsDto,
  ) {
    return this.interviewAi.generateQuestions(tenant, id, { count: dto.count, focus: dto.focus ?? null });
  }

  // The assigned interviewer turning their raw notes into a structured scorecard.
  @Post('interviews/:id/scorecard')
  @RequirePermissions('interview:view_assigned')
  generateScorecard(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') id: string,
    @Body() dto: GenerateScorecardDto,
  ) {
    return this.interviewAi.generateScorecard(tenant, id, dto.notes);
  }
}
