import { BadRequestException, Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AiInvocationService } from './ai-invocation.service';
import { QuestionTagsClient } from './clients/question-tags.client';
import { QuestionDistractorsClient } from './clients/question-distractors.client';

export interface SuggestedTags {
  // Existing org tags the AI matched (safe to apply directly).
  existing: { tagId: string; name: string }[];
  // New tag names the AI proposed that aren't in the org yet (author decides whether to create).
  suggested: string[];
}

const MAX_DISTRACTORS = 8;

@Injectable()
export class QuestionAiService {
  constructor(
    private readonly ai: AiInvocationService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly tagsClient: QuestionTagsClient,
    private readonly distractorsClient: QuestionDistractorsClient,
  ) {}

  async suggestTags(context: TenantContext, input: { text: string; options?: string[] }): Promise<SuggestedTags> {
    const text = (input.text ?? '').trim();
    if (!text) throw new BadRequestException('question text is required');
    const orgId = context.organizationId as string;

    const orgTags = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.tag.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    );
    const byLowerName = new Map(orgTags.map((t) => [t.name.toLowerCase(), t]));

    const result = await this.ai.run(context, { source: 'question_tags', sourceId: null }, (p) =>
      this.tagsClient.generate({ text, options: input.options, availableTags: orgTags.map((t) => t.name) }, p),
    );

    // Map matched names back to real tags (case-insensitive); anything the model "matched" that isn't a
    // real tag falls through to suggested. Dedupe suggested against existing names.
    const existing: { tagId: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const name of result.matched) {
      const tag = byLowerName.get(name.toLowerCase());
      if (tag && !seen.has(tag.id)) {
        existing.push({ tagId: tag.id, name: tag.name });
        seen.add(tag.id);
      }
    }
    const suggested = [...new Set(result.suggested.map((s) => s.trim()).filter((s) => s && !byLowerName.has(s.toLowerCase())))];
    return { existing, suggested };
  }

  async generateDistractors(
    context: TenantContext,
    input: { stem: string; correctAnswers: string[]; count?: number },
  ): Promise<{ distractors: string[] }> {
    const stem = (input.stem ?? '').trim();
    if (!stem) throw new BadRequestException('question stem is required');
    const correct = (input.correctAnswers ?? []).map((s) => s.trim()).filter(Boolean);
    if (correct.length === 0) throw new BadRequestException('at least one correct answer is required');
    const count = Math.min(Math.max(input.count ?? 3, 1), MAX_DISTRACTORS);

    return this.ai.run(context, { source: 'question_distractors', sourceId: null }, (p) =>
      this.distractorsClient.generate({ stem, correctAnswers: correct, count }, p),
    );
  }
}
