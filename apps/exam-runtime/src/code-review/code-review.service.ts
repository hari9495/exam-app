import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Injectable()
export class CodeReviewService {
  private readonly logger = new Logger(CodeReviewService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeCodeReviewClient: ClaudeCodeReviewClient,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}

  async analyze(answerId: string): Promise<void> {
    const answer = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.answer.findUniqueOrThrow({
        where: { id: answerId },
        include: { question: true, attempt: { include: { invitation: { include: { exam: true } } } } },
      }),
    );
    const organizationId = answer.attempt.invitation.exam.organizationId;

    let result: { status: string; suggestedMarks: number | null; summary: string | null };
    let chargeCredit = false;
    if (!answer.answerText || answer.answerText.trim() === '') {
      // No point spending an AI call (or a credit) reviewing a blank submission — this happens
      // legitimately for a code question the candidate never answered (see finalize()'s blank
      // Answer row for pending-manual-grade attempts).
      result = { status: 'completed', suggestedMarks: 0, summary: 'No code was submitted for this question.' };
    } else {
      try {
        const apiKey = await this.aiApiKeyResolver.resolve(organizationId);
        const review = await this.claudeCodeReviewClient.review(
          {
            questionText: answer.question.text,
            starterCode: answer.question.starterCode,
            codeLanguage: answer.codeLanguage ?? 'plaintext',
            answerText: answer.answerText,
            marks: answer.question.marks,
          },
          apiKey,
        );
        result = { status: 'completed', suggestedMarks: review.suggestedMarks, summary: review.summary };
        chargeCredit = true;
      } catch (error) {
        this.logger.error(`Code review generation failed for answer ${answerId}`, error as Error);
        result = { status: 'failed', suggestedMarks: null, summary: null };
      }
    }

    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      await tx.codeAnswerReview.upsert({
        where: { answerId },
        create: { answerId, ...result },
        update: { ...result, generatedAt: new Date() },
      });
      if (chargeCredit) {
        await tx.aiCreditUsage.create({
          data: { organizationId, source: 'code_review', credits: 1, sourceId: answerId },
        });
      }
    });
  }
}
