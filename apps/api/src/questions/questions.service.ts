import { Injectable, NotFoundException } from '@nestjs/common';
import { Question, QuestionOption } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { validateQuestionPayload } from './question-validation';

type QuestionWithOptions = Question & { options: QuestionOption[] };

interface QuestionFilters {
  topic?: string;
  difficulty?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class QuestionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, userId: string, dto: CreateQuestionDto): Promise<QuestionWithOptions> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
    });

    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.question.create({
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
        },
        include: { options: true },
      }),
    );
  }

  async list(context: TenantContext, filters: QuestionFilters): Promise<Question[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.question.findMany({
        where: {
          organizationId: context.organizationId as string,
          ...(filters.topic ? { topic: filters.topic } : {}),
          ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
          status: filters.status ?? 'active',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
    );
  }

  async findOne(context: TenantContext, id: string): Promise<QuestionWithOptions> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const question = await tx.question.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: { options: true },
      });
      if (!question) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      return question;
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateQuestionDto): Promise<QuestionWithOptions> {
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

      await tx.questionOption.deleteMany({ where: { questionId: id } });

      return tx.question.update({
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
        },
        include: { options: true },
      });
    });
  }

  async archive(context: TenantContext, id: string): Promise<QuestionWithOptions> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      return tx.question.update({
        where: { id },
        data: { status: 'archived' },
        include: { options: true },
      });
    });
  }
}
