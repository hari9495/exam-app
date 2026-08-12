import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import { QuestionGenerationClient, GeneratedQuestion } from './question-generation.client';
import { validateQuestionPayload } from '../../questions/question-validation';

interface AiQuestionGenerationInput {
  topic: string;
  difficulty: string;
  questionTypes: string[];
  count: number;
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

  constructor(
    private readonly questionGenerationClient: QuestionGenerationClient,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}

  async process(input: unknown, context: TenantContext, aiJobId: string): Promise<AiQuestionGenerationOutput> {
    const { topic, difficulty, questionTypes, count, requestedBy } = input as AiQuestionGenerationInput;

    const aiProvider = await this.aiApiKeyResolver.resolve(context.organizationId as string);
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
          marks: 1,
          negativeMarks: 0,
          options: question.options,
        });
        valid.push(question);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown validation error';
        dropped.push({ reason });
      }
    }

    const questionIds = await this.tenantPrisma.forTenant(context, async (tx) => {
      const ids: string[] = [];
      for (const question of valid) {
        const created = await tx.question.create({
          data: {
            organizationId: context.organizationId as string,
            type: question.type,
            text: question.text,
            topic,
            difficulty,
            marks: 1,
            negativeMarks: 0,
            status: 'draft',
            aiGenerated: true,
            createdBy: requestedBy,
            options: {
              create: question.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
            },
          },
        });
        ids.push(created.id);
      }
      if (ids.length > 0) {
        await tx.aiCreditUsage.create({
          data: { organizationId: context.organizationId as string, source: 'question_generation', credits: ids.length, sourceId: null },
        });
      }
      return ids;
    });

    return { requested: count, created: questionIds.length, dropped, questionIds };
  }
}
