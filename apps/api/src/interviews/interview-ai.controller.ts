import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { InterviewAiService } from './interview-ai.service';
import { GenerateInterviewQuestionsDto } from './dto/generate-interview-questions.dto';

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
  // HIR-25: the older notes-to-scorecard route (POST interviews/:id/scorecard) is removed; the notetaker draft
  // (hiring/interviews/:id/notetaker/draft) replaces it, from a consented transcript.
}
