import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Question, QuestionOption, QuestionTag, Tag } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { BlobStorageService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { AiApiKeyResolverService } from '@exam-platform/shared';
import { randomUUID } from 'crypto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { validateQuestionPayload } from './question-validation';
import { JobsService } from '../jobs/jobs.service';
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';
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

const ALLOWED_QUESTION_IMAGE_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};
const MAX_QUESTION_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Reduce an image URL to the bare blob URL before it is STORED.
 *
 * Reads hand back a SAS-signed URL (see toResponse), and the edit form posts back whatever it
 * was given -- so without this the ~20-minute read token gets persisted into image_url. Once it
 * expires the picture is dead for good: signIfOurs cannot re-sign a URL that already carries a
 * token, so editing a question would silently destroy its own image 20 minutes later. Signing
 * belongs on the way out; the column holds the unsigned URL, always.
 */
export function toStoredImageUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  const query = url.indexOf('?');
  return query === -1 ? url : url.slice(0, query);
}

@Injectable()
export class QuestionsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jobsService: JobsService,
    private readonly examRuntime: ExamRuntimeInternalClient,
    private readonly blobStorage: BlobStorageService,
    private readonly audit: AuditService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}

  private async fetchAvailableLanguagesIfNeeded(type: string, languageMode: string | undefined): Promise<string[]> {
    if (type !== 'code' || languageMode !== 'fixed') {
      return [];
    }
    const { languages } = await this.examRuntime.listAvailableLanguages();
    return languages.map((entry) => entry.language);
  }

  async create(context: TenantContext, userId: string, dto: CreateQuestionDto): Promise<QuestionResponse> {
    const availableLanguages = await this.fetchAvailableLanguagesIfNeeded(dto.type, dto.languageMode);
    validateQuestionPayload(
      {
        type: dto.type,
        difficulty: dto.difficulty,
        marks: dto.marks,
        negativeMarks: dto.negativeMarks ?? 0,
        options: dto.options,
        languageMode: dto.languageMode,
        allowedLanguages: dto.allowedLanguages,
      },
      availableLanguages,
    );

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
          languageMode: dto.languageMode ?? 'fixed',
          allowedLanguages: dto.allowedLanguages ? JSON.stringify(dto.allowedLanguages) : null,
          starterCode: dto.starterCode ?? null,
          allowStdin: dto.allowStdin ?? false,
          snippetCode: dto.type === 'code' ? null : dto.snippetCode ?? null,
          snippetLanguage: dto.type === 'code' ? null : dto.snippetLanguage ?? null,
          imageUrl: dto.type === 'code' ? null : toStoredImageUrl(dto.imageUrl),
          createdBy: userId,
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index, imageUrl: toStoredImageUrl(o.imageUrl) })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
    });
    await this.audit.record(context, {
      actorUserId: userId,
      action: 'question.created',
      entityType: 'question',
      entityId: question.id,
      metadata: { type: dto.type, difficulty: dto.difficulty },
    });
    return this.toResponse(question as QuestionWithRelations);
  }

  async uploadImage(file: Express.Multer.File): Promise<{ imageUrl: string }> {
    const extension = ALLOWED_QUESTION_IMAGE_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Image must be a PNG, JPEG, or SVG image');
    }
    if (file.size > MAX_QUESTION_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Image file must be 2MB or smaller');
    }

    const blobPath = `question-images/${randomUUID()}${extension}`;
    const imageUrl = await this.blobStorage.upload(blobPath, file.buffer, file.mimetype);

    return { imageUrl };
  }

  async listAvailableLanguages(): Promise<{ language: string; version: string }[]> {
    const { languages } = await this.examRuntime.listAvailableLanguages();
    return languages;
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
          include: { options: true, tags: { include: { tag: true } } },
        }),
        tx.question.count({ where }),
      ]);
      const data = await Promise.all(questions.map((q) => this.toResponse(q as unknown as QuestionWithRelations)));
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

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpdateQuestionDto): Promise<QuestionResponse> {
    const availableLanguages = await this.fetchAvailableLanguagesIfNeeded(dto.type, dto.languageMode);
    validateQuestionPayload(
      {
        type: dto.type,
        difficulty: dto.difficulty,
        marks: dto.marks,
        negativeMarks: dto.negativeMarks ?? 0,
        options: dto.options,
        languageMode: dto.languageMode,
        allowedLanguages: dto.allowedLanguages,
      },
      availableLanguages,
    );

    const result = await this.tenantPrisma.forTenant(context, async (tx) => {
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
          languageMode: dto.languageMode ?? 'fixed',
          allowedLanguages: dto.allowedLanguages ? JSON.stringify(dto.allowedLanguages) : null,
          starterCode: dto.starterCode ?? null,
          allowStdin: dto.allowStdin ?? false,
          snippetCode: dto.type === 'code' ? null : dto.snippetCode ?? null,
          snippetLanguage: dto.type === 'code' ? null : dto.snippetLanguage ?? null,
          imageUrl: dto.type === 'code' ? null : toStoredImageUrl(dto.imageUrl),
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index, imageUrl: toStoredImageUrl(o.imageUrl) })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
      return this.toResponse(updated as QuestionWithRelations);
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'question.updated',
      entityType: 'question',
      entityId: id,
      metadata: { type: dto.type, difficulty: dto.difficulty },
    });
    return result;
  }

  async archive(context: TenantContext, actorUserId: string, id: string): Promise<QuestionResponse> {
    const result = await this.tenantPrisma.forTenant(context, async (tx) => {
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
    await this.audit.record(context, {
      actorUserId,
      action: 'question.archived',
      entityType: 'question',
      entityId: id,
    });
    return result;
  }

  async aiGenerate(context: TenantContext, userId: string, dto: AiGenerateQuestionsDto): Promise<{ aiJobId: string }> {
    // Fail fast: every generated question would fail this exact check downstream (see
    // validateQuestionPayload) and be silently dropped -- after the provider call had been paid for.
    if (dto.negativeMarks > dto.marks) {
      throw new BadRequestException('negativeMarks cannot exceed marks');
    }

    if (dto.tagIds.length > 0) {
      // The processor resolves tags org-scoped and skips what it cannot resolve, deliberately --
      // losing a whole paid-for batch over one stale tag is worse than a question landing with
      // fewer tags. But that means a stale/foreign tag id otherwise produces untagged drafts with
      // no signal the recruiter can see (the processor's warning is server-side only). Catch it
      // here, before anything is enqueued or billed.
      await this.tenantPrisma.forTenant(context, async (tx) => {
        const resolved = await tx.tag.findMany({
          where: { id: { in: dto.tagIds }, organizationId: context.organizationId as string },
          select: { id: true },
        });
        const resolvedIds = new Set(resolved.map((t) => t.id));
        const unresolved = dto.tagIds.filter((id) => !resolvedIds.has(id));
        if (unresolved.length > 0) {
          throw new BadRequestException(`Unknown tag id(s) for this organization: ${unresolved.join(', ')}`);
        }
      });
    }

    // Fail fast. Without this the job is enqueued, picked up, and fails minutes later -- the
    // recruiter waits for a result that was never possible.
    //
    // The resolver throws a plain Error, which Nest maps to a 500 -- and the web client renders
    // every 500 as a generic "something went wrong, try again" (see humanizeHttpError). That's
    // wrong here: the guard is right (nothing enqueued, nothing billed) but "try again" can never
    // work when the org simply has no AI provider configured. Rethrow as a 400 with a message the
    // web client will pass through untouched, naming the real, fixable problem.
    try {
      await this.aiApiKeyResolver.resolve(context.organizationId as string);
    } catch {
      throw new BadRequestException(
        'This organization has no AI provider configured. Ask an org admin to set one up before generating questions.',
      );
    }

    const inputJson = JSON.stringify({
      topic: dto.topic,
      difficulty: dto.difficulty,
      questionTypes: dto.questionTypes,
      count: dto.count,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks,
      tagIds: dto.tagIds,
      requestedBy: userId,
    });
    const aiJob = await this.jobsService.enqueue(context, 'ai-question-generation', inputJson, userId);
    return { aiJobId: aiJob.id };
  }

  // Serves both the Drafts view's Publish and the Archived view's Restore, and deliberately sends
  // both to 'active'. Restoring a discarded AI draft therefore skips a second review -- accepted,
  // because the bulk bar is gated to the Drafts view, so Restore is only ever one click on one row
  // the recruiter is looking at. Routing AI questions back to 'draft' instead would make two rows
  // in the same Archived list behave differently with nothing on screen explaining why, and the
  // invariant that actually protects exams is enforced elsewhere: a non-active question cannot be
  // added to a section (see exam-section-question-validation.ts).
  async publish(context: TenantContext, actorUserId: string, id: string): Promise<QuestionResponse> {
    const result = await this.tenantPrisma.forTenant(context, async (tx) => {
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
    await this.audit.record(context, {
      actorUserId,
      action: 'question.published',
      entityType: 'question',
      entityId: id,
    });
    return result;
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
    // ponytail: brief's snippet checked `validRows` here, which is always empty at this point
    // (it's populated by the loop below) — checking the parsed `rows` instead so a fixed-mode
    // code row actually gets a non-empty availableLanguages list to validate against.
    // Only FIXED-mode code rows need the runtime list; an all-'any' upload skips the call.
    const availableLanguages = rows.some((row) => row.type === 'code' && row.languageMode !== 'any')
      ? (await this.examRuntime.listAvailableLanguages()).languages.map((entry) => entry.language)
      : [];
    for (const row of rows) {
      try {
        validateQuestionPayload(
          {
            type: row.type,
            difficulty: row.difficulty,
            marks: row.marks,
            negativeMarks: row.negativeMarks,
            options: row.options,
            languageMode: row.type === 'code' ? row.languageMode ?? 'fixed' : undefined,
            allowedLanguages:
              row.type === 'code' && row.languageMode !== 'any' && row.codeLanguage ? [row.codeLanguage] : undefined,
          },
          availableLanguages,
        );
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
            languageMode: 'fixed',
            allowedLanguages: row.type === 'code' && row.codeLanguage ? JSON.stringify([row.codeLanguage]) : null,
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
        results.push(await this.toResponse(question as QuestionWithRelations));
      }
      return results;
    });

    if (created.length > 0) {
      await this.audit.record(context, {
        actorUserId: userId,
        action: 'question.bulk_uploaded',
        entityType: 'question',
        metadata: { count: created.length },
      });
    }

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

  private async toResponse(question: QuestionWithRelations): Promise<QuestionResponse> {
    const { tags, ...rest } = question;
    // Question/option images sit in the private blob container; the raw stored URL 404s in the
    // browser, so mint a short-lived read SAS on the way out (same pattern as logos/evidence).
    const imageUrl = (await this.blobStorage.signIfOurs(rest.imageUrl ?? null)) as string | null;
    const options = rest.options
      ? await Promise.all(
          rest.options.map(async (o) => ({ ...o, imageUrl: (await this.blobStorage.signIfOurs(o.imageUrl ?? null)) as string | null })),
        )
      : rest.options;
    // allowedLanguages is persisted as a JSON string, but the client types and uses it as string[]
    // (e.g. `allowedLanguages.join(', ')`). exam-runtime already parses it on its read path; the
    // recruiter API must too, or a single code question throws "join is not a function" and crashes
    // the whole question-bank list render. Malformed/empty -> [].
    let allowedLanguages: string[] = [];
    if (rest.allowedLanguages) {
      try {
        const parsed = JSON.parse(rest.allowedLanguages);
        if (Array.isArray(parsed)) allowedLanguages = parsed;
      } catch {
        allowedLanguages = [];
      }
    }
    return { ...rest, imageUrl, options, allowedLanguages, tags: tags.map((qt) => ({ id: qt.tag.id, name: qt.tag.name })) } as unknown as QuestionResponse;
  }
}
