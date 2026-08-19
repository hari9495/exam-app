import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import { QuestionGenerationClient, GeneratedQuestion } from './question-generation.client';
import { validateQuestionPayload } from '../../questions/question-validation';
import { QuotaService } from '../../billing/quota.service';

interface AiQuestionGenerationInput {
  topic: string;
  difficulty: string;
  questionTypes: string[];
  count: number;
  marks: number;
  negativeMarks: number;
  tagIds: string[];
  requestedBy: string;
}

interface DroppedQuestion {
  reason: string;
}

interface AiQuestionGenerationOutput {
  requested: number;
  created: number;
  dropped: DroppedQuestion[];
  questionIds: string[];
}

@Injectable()
export class AiQuestionGenerationProcessor implements JobProcessor {
  readonly type = 'ai-question-generation';
  private readonly logger = new Logger(AiQuestionGenerationProcessor.name);

  constructor(
    private readonly questionGenerationClient: QuestionGenerationClient,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly quota: QuotaService,
  ) {}

  async process(input: unknown, context: TenantContext, aiJobId: string): Promise<AiQuestionGenerationOutput> {
    // inputJson is persisted JSON written at enqueue time, so a job enqueued before marks/negativeMarks/tagIds
    // were added to the payload shape can still be picked up (or retried) after this deploy — default them to
    // the old hardcoded behaviour instead of throwing on the missing fields.
    const {
      topic,
      difficulty,
      questionTypes,
      count,
      marks = 1,
      negativeMarks = 0,
      tagIds = [],
      requestedBy,
    } = input as AiQuestionGenerationInput;

    const aiProvider = await this.aiApiKeyResolver.resolve(context.organizationId as string);

    // Hard quota: block the AI spend when the org has exhausted its monthly AI credits.
    await this.quota.assertWithinLimit(context, 'ai_credits');

    const generated = (await this.questionGenerationClient.generate(topic, difficulty, questionTypes, count, aiProvider)).slice(0, count);

    const valid: GeneratedQuestion[] = [];
    const dropped: DroppedQuestion[] = [];
    for (const question of generated) {
      if (!questionTypes.includes(question.type)) {
        dropped.push({ reason: `Generated type "${question.type}" was not in the requested questionTypes` });
        continue;
      }
      try {
        validateQuestionPayload({
          type: question.type,
          difficulty,
          marks,
          negativeMarks,
          options: question.options,
        });
        valid.push(question);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown validation error';
        dropped.push({ reason });
      }
    }

    const uniqueTagIds = [...new Set(tagIds)];

    const questionIds = await this.tenantPrisma.forTenant(
      context,
      async (tx) => {
        // question_tags has no RLS and SQL Server does not apply RLS predicates to FK validation, so a tag id
        // from another organization would otherwise attach successfully. Resolve org-scoped here and use only
        // what comes back — a single indexed lookup, not slow I/O like the AI provider call above.
        const resolvedTagIds =
          uniqueTagIds.length > 0
            ? (
                await tx.tag.findMany({
                  where: { id: { in: uniqueTagIds }, organizationId: context.organizationId as string },
                  select: { id: true },
                })
              ).map((t) => t.id)
            : [];
        if (resolvedTagIds.length < uniqueTagIds.length) {
          this.logger.warn(
            `AI question generation job ${aiJobId}: dropped ${uniqueTagIds.length - resolvedTagIds.length} of ${uniqueTagIds.length} requested tagIds (not found or not owned by organization ${context.organizationId})`,
          );
        }

        const ids: string[] = [];
        for (const question of valid) {
          const created = await tx.question.create({
            data: {
              organizationId: context.organizationId as string,
              type: question.type,
              text: question.text,
              topic,
              difficulty,
              marks,
              negativeMarks,
              status: 'draft',
              aiGenerated: true,
              aiJobId,
              createdBy: requestedBy,
              options: {
                create: question.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
              },
              ...(resolvedTagIds.length > 0 ? { tags: { create: resolvedTagIds.map((tagId) => ({ tagId })) } } : {}),
            },
          });
          ids.push(created.id);
        }
        if (ids.length > 0) {
          await tx.aiCreditUsage.create({
            data: {
              organizationId: context.organizationId as string,
              source: 'question_generation',
              credits: ids.length,
              sourceId: aiJobId,
            },
          });
        }
        return ids;
      },
      // The provider call above already happened and was already billed, so an expiry here
      // destroys a batch the organization has paid for. count is capped at 20, and each question
      // is one insert plus one per option, so the normal path is far inside Prisma's 5s default --
      // this only takes effect when the box is loaded enough that the default would have lost the
      // batch. maxWait matters for the same reason: waiting for a pooled connection can exceed its
      // 2s default under load, and that failure is just as expensive.
      { timeout: 30_000, maxWait: 10_000 },
    );

    return { requested: count, created: questionIds.length, dropped, questionIds };
  }
}
