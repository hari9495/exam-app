import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Question, QuestionOption, QuestionTag, Tag } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { validateQuestionPayload } from './question-validation';

type QuestionWithRelations = Question & { options?: QuestionOption[]; tags: (QuestionTag & { tag: Tag })[] };
type QuestionResponse = Omit<QuestionWithRelations, 'tags'> & { tags: { id: string; name: string }[] };

interface QuestionFilters {
  topic?: string;
  difficulty?: string;
  status?: string;
  tagId?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class QuestionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, userId: string, dto: CreateQuestionDto): Promise<QuestionResponse> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
    });

    const question = await this.tenantPrisma.forTenant(context, async (tx) => {
      const tagIds = await this.resolveTagIds(tx, context.organizationId as string, dto.tags ?? []);
      return tx.question.create({
        data: {
          organizationId: context.organizationId as string,
          type: dto.type,
          text: dto.text,
          topic: dto.topic,
          category: dto.category,
          difficulty: dto.difficulty,
          marks: dto.marks,
          negativeMarks: dto.negativeMarks ?? 0,
          createdBy: userId,
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
    });
    return this.toResponse(question as QuestionWithRelations);
  }

  async list(context: TenantContext, filters: QuestionFilters): Promise<QuestionResponse[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;
    const questions = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.question.findMany({
        where: {
          organizationId: context.organizationId as string,
          ...(filters.topic ? { topic: filters.topic } : {}),
          ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
          ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
          status: filters.status ?? 'active',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
        include: { tags: { include: { tag: true } } },
      }),
    );
    return questions.map((q) => this.toResponse(q as unknown as QuestionWithRelations));
  }

  async findOne(context: TenantContext, id: string): Promise<QuestionResponse> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const question = await tx.question.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: { options: true, tags: { include: { tag: true } } },
      });
      if (!question) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      return this.toResponse(question as unknown as QuestionWithRelations);
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateQuestionDto): Promise<QuestionResponse> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
    });

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }

      const tagIds = await this.resolveTagIds(tx, context.organizationId as string, dto.tags ?? []);

      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.questionTag.deleteMany({ where: { questionId: id } });

      const updated = await tx.question.update({
        where: { id },
        data: {
          type: dto.type,
          text: dto.text,
          topic: dto.topic,
          category: dto.category,
          difficulty: dto.difficulty,
          marks: dto.marks,
          negativeMarks: dto.negativeMarks ?? 0,
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
      return this.toResponse(updated as QuestionWithRelations);
    });
  }

  async archive(context: TenantContext, id: string): Promise<QuestionResponse> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      const archived = await tx.question.update({
        where: { id },
        data: { status: 'archived' },
        include: { options: true, tags: { include: { tag: true } } },
      });
      return this.toResponse(archived as QuestionWithRelations);
    });
  }

  private async resolveTagIds(tx: Prisma.TransactionClient, organizationId: string, names: string[]): Promise<string[]> {
    const trimmed = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))];
    const tags = await Promise.all(
      trimmed.map((name) =>
        tx.tag.upsert({
          where: { organizationId_name: { organizationId, name } },
          create: { organizationId, name },
          update: {},
        }),
      ),
    );
    return tags.map((tag) => tag.id);
  }

  private toResponse(question: QuestionWithRelations): QuestionResponse {
    const { tags, ...rest } = question;
    return { ...rest, tags: tags.map((qt) => ({ id: qt.tag.id, name: qt.tag.name })) } as QuestionResponse;
  }
}
