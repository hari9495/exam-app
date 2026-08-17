import { Injectable, Logger } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import {
  TenantContext,
  TenantPrismaService,
  BlobStorageService,
  AiApiKeyResolverService,
  AiNotConfiguredError,
  AiProvider,
} from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';

// AI extracts free text out of the résumé; truncate before sending it so a huge PDF cannot blow
// past the model's context window or run up token cost on filler pages.
const MAX_RESUME_TEXT_CHARS = 40_000;

interface ResumeParseInput {
  candidateId: string;
}

interface ParsedResume {
  summary: string;
  skills?: string[];
  title?: string | null;
  yearsExperience?: number | null;
}

function buildResumeParseSchema() {
  return {
    type: 'object' as const,
    properties: {
      summary: { type: 'string', description: 'A concise 2-3 sentence professional summary of the candidate.' },
      skills: { type: 'array', items: { type: 'string' }, description: 'Key technical/professional skills.' },
      title: { type: 'string', description: "The candidate's most recent or most senior job title." },
      yearsExperience: { type: 'number', description: 'Total years of professional experience, estimated if not explicit.' },
    },
    required: ['summary'],
  };
}

@Injectable()
export class ResumeParseProcessor implements JobProcessor {
  readonly type = 'resume_parse';
  private readonly logger = new Logger(ResumeParseProcessor.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}

  async process(input: unknown, context: TenantContext, aiJobId: string): Promise<unknown> {
    const { candidateId } = input as ResumeParseInput;

    const profile = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateProfile.findUnique({ where: { candidateId } }),
    );
    if (!profile?.resumePath) {
      return this.setStatus(context, candidateId, 'failed');
    }

    try {
      // Resolved as its own step so a MISSING key is recorded distinctly from a genuine parse/AI
      // failure -- collapsing both into `failed` would offer a Retry button for a condition
      // retrying can never fix (see AiNotConfiguredError doc comment).
      const aiProvider = await this.aiApiKeyResolver.resolve(context.organizationId as string).catch((error) => {
        if (error instanceof AiNotConfiguredError) return null;
        throw error;
      });
      if (!aiProvider) {
        return this.setStatus(context, candidateId, 'unavailable');
      }

      const buf = await this.blobStorage.downloadToBuffer(profile.resumePath);
      const text = (await pdfParse(buf)).text.slice(0, MAX_RESUME_TEXT_CHARS);
      const parsed = await this.callAi(aiProvider, text);

      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.candidateProfile.update({
          where: { candidateId },
          data: {
            parseStatus: 'done',
            parsedSummary: parsed.summary,
            parsedSkills: JSON.stringify(parsed.skills ?? []),
            parsedTitle: parsed.title ?? null,
            parsedYearsExperience: parsed.yearsExperience ?? null,
            parsedAt: new Date(),
          },
        }),
      );
      return { ok: true };
    } catch (error) {
      this.logger.error(`Resume parse failed for candidate ${candidateId} (job ${aiJobId})`, error as Error);
      return this.setStatus(context, candidateId, 'failed');
    }
  }

  private async callAi(aiProvider: AiProvider, text: string): Promise<ParsedResume> {
    const result = await aiProvider.generateStructured({
      modelTier: 'fast',
      maxTokens: 1024,
      prompt:
        'Extract structured information from the following résumé text. ' +
        'Provide a concise professional summary, a list of key skills, the most recent/senior job title, ' +
        `and the candidate's total years of professional experience.\n\nRésumé text:\n${text}`,
      tool: {
        name: 'report_parsed_resume',
        description: 'Report structured information extracted from a résumé.',
        schema: buildResumeParseSchema(),
      },
    });

    if (typeof result.summary !== 'string') {
      throw new Error('AI provider returned a malformed résumé parse result');
    }
    return result as unknown as ParsedResume;
  }

  private setStatus(context: TenantContext, candidateId: string, parseStatus: 'failed' | 'unavailable') {
    return this.tenantPrisma
      .forTenant(context, (tx) => tx.candidateProfile.update({ where: { candidateId }, data: { parseStatus } }))
      .then(() => ({ ok: false, status: parseStatus }));
  }
}
