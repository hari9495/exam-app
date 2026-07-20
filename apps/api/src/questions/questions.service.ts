import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Question, QuestionOption, QuestionTag, Tag } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { validateQuestionPayload } from './question-validation';
import { JobsService } from '../jobs/jobs.service';
import { AiGenerateQuestionsDto } from './dto/ai-generate-questions.dto';
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
import {
  parseBulkQuestionFile,
  detectFileKind,
  MAX_BULK_UPLOAD_SIZE_BYTES,
  MAX_BULK_UPLOAD_ROWS,
  BulkQuestionRow,
  BulkUploadRowError,
} from './bulk-upload-parser';

type QuestionWithRelations = Question & { options?: QuestionOption[]; tags: (QuestionTag & { tag: Tag })[] };
type QuestionResponse = Omit<QuestionWithRelations, 'tags'> & { tags: { id: string; name: string }[] };

interface QuestionFilters {
  topic?: string;
  difficulty?: string;
  status?: string;
  tagId?: string;
  page?: string;
  pageSize?: string;
  search?: string;
}

export interface BulkUploadResult {
  created: QuestionResponse[];
  errors: BulkUploadRowError[];
}

@Injectable()
export class QuestionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jobsService: JobsService,
  ) {}

  async create(context: TenantContext, userId: string, dto: CreateQuestionDto): Promise<QuestionResponse> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
      codeLanguage: dto.codeLanguage,
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
          codeLanguage: dto.codeLanguage,
          starterCode: dto.starterCode,
          allowStdin: dto.allowStdin ?? false,
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

  async list(context: TenantContext, filters: QuestionFilters): Promise<PaginatedResponse<QuestionResponse>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = {
        organizationId: context.organizationId as string,
        ...(filters.topic ? { topic: filters.topic } : {}),
        ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
        ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
        status: filters.status ?? 'active',
        ...(filters.search ? { text: { contains: filters.search } } : {}),
      };
      const [questions, total] = await Promise.all([
        tx.question.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
          include: { tags: { include: { tag: true } } },
        }),
        tx.question.count({ where }),
      ]);
      const data = questions.map((q) => this.toResponse(q as unknown as QuestionWithRelations));
      return buildPaginatedResponse(data, total, page, pageSize);
    });
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
      codeLanguage: dto.codeLanguage,
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
          codeLanguage: dto.codeLanguage,
          starterCode: dto.starterCode,
          allowStdin: dto.allowStdin ?? false,
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

  async aiGenerate(context: TenantContext, userId: string, dto: AiGenerateQuestionsDto): Promise<{ aiJobId: string }> {
    const inputJson = JSON.stringify({
      topic: dto.topic,
      difficulty: dto.difficulty,
      questionTypes: dto.questionTypes,
      count: dto.count,
      requestedBy: userId,
    });
    const aiJob = await this.jobsService.enqueue(context, 'ai-question-generation', inputJson, userId);
    return { aiJobId: aiJob.id };
  }

  async publish(context: TenantContext, id: string): Promise<QuestionResponse> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      const published = await tx.question.update({
        where: { id },
        data: { status: 'active' },
        include: { options: true, tags: { include: { tag: true } } },
      });
      return this.toResponse(published as QuestionWithRelations);
    });
  }

  async bulkUpload(context: TenantContext, userId: string, file: Express.Multer.File): Promise<BulkUploadResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const kind = detectFileKind(file.originalname);
    if (!kind) {
      throw new BadRequestException('File must be a .csv or .xlsx file');
    }
    if (file.size > MAX_BULK_UPLOAD_SIZE_BYTES) {
      throw new BadRequestException('File must be 5MB or smaller');
    }

    let rows: BulkQuestionRow[];
    let parseErrors: BulkUploadRowError[];
    try {
      ({ rows, errors: parseErrors } = await parseBulkQuestionFile(file.buffer, kind));
    } catch (error) {
      throw new BadRequestException(`Unable to parse file: ${error instanceof Error ? error.message : 'invalid file'}`);
    }
    if (rows.length + parseErrors.length > MAX_BULK_UPLOAD_ROWS) {
      throw new BadRequestException(
        `File must contain at most ${MAX_BULK_UPLOAD_ROWS} questions (found ${rows.length + parseErrors.length})`,
      );
    }

    const validationErrors: BulkUploadRowError[] = [];
    const validRows: BulkQuestionRow[] = [];
    for (const row of rows) {
      try {
        validateQuestionPayload({
          type: row.type,
          difficulty: row.difficulty,
          marks: row.marks,
          negativeMarks: row.negativeMarks,
          options: row.options,
          codeLanguage: row.codeLanguage,
        });
        validRows.push(row);
      } catch (err) {
        validationErrors.push({ row: row.rowNumber, message: err instanceof Error ? err.message : 'Invalid row' });
      }
    }

    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      const results: QuestionResponse[] = [];
      for (const row of validRows) {
        const tagIds = await this.resolveTagIds(tx, context.organizationId as string, row.tags);
        const question = await tx.question.create({
          data: {
            organizationId: context.organizationId as string,
            type: row.type,
            text: row.text,
            topic: row.topic,
            category: row.category,
            difficulty: row.difficulty,
            marks: row.marks,
            negativeMarks: row.negativeMarks,
            codeLanguage: row.codeLanguage,
            starterCode: row.starterCode,
            createdBy: userId,
            options: {
              create: row.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
            },
            tags: {
              create: tagIds.map((tagId) => ({ tagId })),
            },
          },
          include: { options: true, tags: { include: { tag: true } } },
        });
        results.push(this.toResponse(question as QuestionWithRelations));
      }
      return results;
    });

    const errors = [...parseErrors, ...validationErrors].sort((a, b) => a.row - b.row);
    return { created, errors };
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
    return [...new Set(tags.map((tag) => tag.id))];
  }

  private toResponse(question: QuestionWithRelations): QuestionResponse {
    const { tags, ...rest } = question;
    return { ...rest, tags: tags.map((qt) => ({ id: qt.tag.id, name: qt.tag.name })) } as QuestionResponse;
  }
}
