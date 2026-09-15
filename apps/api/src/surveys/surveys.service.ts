import { randomUUID } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { CandidateEmailsService } from '../candidate-emails/candidate-emails.service';
import { UpsertSurveyDto } from './dto/survey.dto';

// super-admin flag on forTenant bypasses the RLS predicate entirely, so this placeholder org is
// never used for filtering -- it just satisfies the TenantContext shape for a token lookup that
// spans tenants (the token itself IS the authorization for an unauthenticated visitor).
const LOOKUP_ORG = '00000000-0000-0000-0000-000000000000';

// Fixed invite copy. Placeholders resolved by candidate-email-render (surveyLink added there).
const INVITE_SUBJECT = 'Share your feedback with {{orgName}}';
const INVITE_BODY =
  'Hi {{candidateName}},\n\n{{orgName}} would value your feedback on your recent experience. ' +
  'It only takes a minute:\n\n{{surveyLink}}\n\nThank you.';

export interface SurveyQuestion {
  type: 'rating' | 'text';
  prompt: string;
}

interface SurveyAnswer {
  prompt: string;
  type: 'rating' | 'text';
  value: number | string | null;
}

export interface SurveyView {
  id: string;
  name: string;
  enabled: boolean;
  triggerStage: string | null;
  questions: SurveyQuestion[];
  createdAt: Date;
  updatedAt: Date;
}

export interface SurveySummaryQuestion {
  prompt: string;
  type: 'rating' | 'text';
  count: number;
  averageRating?: number;
  distribution?: Record<string, number>;
  responses?: string[];
}

export interface SurveySummary {
  survey: { id: string; name: string };
  totalInvited: number;
  totalSubmitted: number;
  responseRate: number;
  questions: SurveySummaryQuestion[];
}

function parseQuestions(json: string): SurveyQuestion[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as SurveyQuestion[]) : [];
  } catch {
    return [];
  }
}

function parseAnswers(json: string | null): SurveyAnswer[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as SurveyAnswer[]) : [];
  } catch {
    return [];
  }
}

@Injectable()
export class SurveysService {
  private readonly logger = new Logger(SurveysService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly candidateEmails: CandidateEmailsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Definition CRUD -------------------------------------------------------------------------

  async list(context: TenantContext) {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const surveys = await tx.surveyDefinition.findMany({ orderBy: { createdAt: 'desc' } });
      const counts = await tx.surveyResponse.groupBy({ by: ['surveyId', 'status'], _count: { _all: true } });
      const invited = new Map<string, number>();
      const submitted = new Map<string, number>();
      for (const c of counts) {
        invited.set(c.surveyId, (invited.get(c.surveyId) ?? 0) + c._count._all);
        if (c.status === 'submitted') submitted.set(c.surveyId, c._count._all);
      }
      return surveys.map((s) => ({
        ...this.toView(s),
        invited: invited.get(s.id) ?? 0,
        submitted: submitted.get(s.id) ?? 0,
      }));
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertSurveyDto): Promise<SurveyView> {
    this.validateQuestions(dto.questions);
    const survey = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.surveyDefinition.create({
        data: {
          organizationId: context.organizationId as string,
          name: dto.name,
          enabled: dto.enabled ?? false,
          triggerStage: dto.triggerStage?.trim() || null,
          questionsJson: JSON.stringify(dto.questions),
          createdByUserId: actorUserId,
        },
      }),
    );
    await this.audit.record(context, { actorUserId, action: 'survey.created', entityType: 'survey', entityId: survey.id, metadata: { name: dto.name } });
    return this.toView(survey);
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpsertSurveyDto): Promise<SurveyView> {
    this.validateQuestions(dto.questions);
    await this.requireSurvey(context, id);
    const survey = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.surveyDefinition.update({
        where: { id },
        data: {
          name: dto.name,
          enabled: dto.enabled ?? false,
          triggerStage: dto.triggerStage?.trim() || null,
          questionsJson: JSON.stringify(dto.questions),
        },
      }),
    );
    await this.audit.record(context, { actorUserId, action: 'survey.updated', entityType: 'survey', entityId: id, metadata: { name: dto.name } });
    return this.toView(survey);
  }

  async setEnabled(context: TenantContext, actorUserId: string, id: string, enabled: boolean): Promise<SurveyView> {
    const survey = await this.requireSurvey(context, id);
    if (enabled && parseQuestions(survey.questionsJson).length === 0) {
      throw new BadRequestException('Add at least one question before enabling the survey');
    }
    const updated = await this.tenantPrisma.forTenant(context, (tx) => tx.surveyDefinition.update({ where: { id }, data: { enabled } }));
    await this.audit.record(context, { actorUserId, action: 'survey.enabled_changed', entityType: 'survey', entityId: id, metadata: { enabled } });
    return this.toView(updated);
  }

  async remove(context: TenantContext, actorUserId: string, id: string) {
    await this.requireSurvey(context, id);
    await this.tenantPrisma.forTenant(context, async (tx) => {
      await tx.surveyResponse.deleteMany({ where: { surveyId: id } });
      await tx.surveyDefinition.delete({ where: { id } });
    });
    await this.audit.record(context, { actorUserId, action: 'survey.deleted', entityType: 'survey', entityId: id });
    return { deleted: true };
  }

  // ---- Invite send -----------------------------------------------------------------------------

  // Mint a per-response token, email the candidate the link, and persist the pending response.
  // One invite per (survey, entry): a repeat is a no-op. Reuses CandidateEmailsService.sendMessage
  // for branding + opt-out handling (a candidate who unsubscribed is skipped silently, no row kept).
  async sendInvite(
    context: TenantContext,
    actorUserId: string | null,
    surveyId: string,
    entryId: string,
  ): Promise<{ sent: boolean; reason?: 'already_sent' | 'opted_out' | 'no_questions' }> {
    const prep = await this.tenantPrisma.forTenant(context, async (tx) => {
      const survey = await tx.surveyDefinition.findFirst({ where: { id: surveyId } });
      if (!survey) throw new NotFoundException('Survey not found');
      const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId }, select: { id: true, candidateId: true } });
      if (!entry) throw new NotFoundException('Pipeline entry not found');
      const existing = await tx.surveyResponse.findFirst({ where: { surveyId, entryId }, select: { id: true } });
      return { hasQuestions: parseQuestions(survey.questionsJson).length > 0, candidateId: entry.candidateId, alreadySent: Boolean(existing) };
    });
    if (!prep.hasQuestions) return { sent: false, reason: 'no_questions' };
    if (prep.alreadySent) return { sent: false, reason: 'already_sent' };

    const token = randomUUID();
    const surveyLink = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/survey/${token}`;
    const sent = await this.candidateEmails.sendMessage(context, actorUserId, entryId, {
      subject: INVITE_SUBJECT,
      body: INVITE_BODY,
      source: 'survey',
      surveyLink,
    });
    if (sent === null) return { sent: false, reason: 'opted_out' };

    try {
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.surveyResponse.create({
          data: {
            organizationId: context.organizationId as string,
            surveyId,
            candidateId: prep.candidateId,
            entryId,
            token,
            status: 'pending',
          },
        }),
      );
    } catch (e) {
      // Unique (survey, entry) violation -> a concurrent invite beat us; treat as already sent.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { sent: false, reason: 'already_sent' };
      throw e;
    }
    await this.audit.record(context, { actorUserId, action: 'survey.invited', entityType: 'survey', entityId: surveyId, metadata: { entryId } });
    return { sent: true };
  }

  // Auto-fire hook, called fire-and-forget from pipeline patchEntry after a stage move. Sends every
  // enabled survey whose triggerStage matches the candidate's NEW global stage. Idempotent via the
  // unique (survey, entry) constraint inside sendInvite.
  async triggerOnStageChange(context: TenantContext, entryId: string): Promise<void> {
    const surveyIds = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findUnique({
        where: { id: entryId },
        select: { candidate: { select: { globalStage: true } } },
      });
      const globalStage = entry?.candidate?.globalStage;
      if (!globalStage) return [];
      const surveys = await tx.surveyDefinition.findMany({ where: { enabled: true, triggerStage: globalStage }, select: { id: true } });
      return surveys.map((s) => s.id);
    });
    for (const surveyId of surveyIds) {
      try {
        await this.sendInvite(context, null, surveyId, entryId);
      } catch (e) {
        this.logger.error(`Survey trigger send failed (survey ${surveyId}, entry ${entryId})`, e as Error);
      }
    }
  }

  // ---- Public (token-keyed) response page ------------------------------------------------------

  async getPublic(token: string) {
    const response = await this.tenantPrisma.forTenant(
      { organizationId: LOOKUP_ORG, isSuperAdmin: true },
      (tx) => tx.surveyResponse.findUnique({ where: { token } }),
    );
    if (!response) throw new NotFoundException('Survey not found');
    const ctx: TenantContext = { organizationId: response.organizationId, isSuperAdmin: false };
    const [survey, org] = await Promise.all([
      this.tenantPrisma.forTenant(ctx, (tx) => tx.surveyDefinition.findFirst({ where: { id: response.surveyId }, select: { name: true, questionsJson: true } })),
      this.tenantPrisma.forTenant(ctx, (tx) => tx.organization.findUnique({ where: { id: response.organizationId }, select: { name: true } })),
    ]);
    if (!survey) throw new NotFoundException('Survey not found');
    return {
      orgName: org?.name ?? '',
      surveyName: survey.name,
      questions: parseQuestions(survey.questionsJson),
      status: response.status as 'pending' | 'submitted',
    };
  }

  async submit(token: string, answers: (string | number | null)[]) {
    const response = await this.tenantPrisma.forTenant(
      { organizationId: LOOKUP_ORG, isSuperAdmin: true },
      (tx) => tx.surveyResponse.findUnique({ where: { token } }),
    );
    if (!response) throw new NotFoundException('Survey not found');
    if (response.status === 'submitted') throw new ConflictException('This survey has already been submitted');

    const ctx: TenantContext = { organizationId: response.organizationId, isSuperAdmin: false };
    const survey = await this.tenantPrisma.forTenant(ctx, (tx) => tx.surveyDefinition.findFirst({ where: { id: response.surveyId }, select: { questionsJson: true } }));
    if (!survey) throw new NotFoundException('Survey not found');
    const questions = parseQuestions(survey.questionsJson);

    // Snapshot answers against the CURRENT questions so aggregates survive later definition edits.
    const snapshot: SurveyAnswer[] = questions.map((q, i) => ({ prompt: q.prompt, type: q.type, value: this.coerceAnswer(q, answers[i]) }));

    await this.tenantPrisma.forTenant(ctx, (tx) =>
      tx.surveyResponse.update({ where: { id: response.id }, data: { status: 'submitted', answersJson: JSON.stringify(snapshot), submittedAt: new Date() } }),
    );
    return { submitted: true };
  }

  // ---- Results aggregate -----------------------------------------------------------------------

  async getSummary(context: TenantContext, surveyId: string): Promise<SurveySummary> {
    const survey = await this.requireSurvey(context, surveyId);
    const responses = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.surveyResponse.findMany({ where: { surveyId }, select: { status: true, answersJson: true } }),
    );
    const submittedRows = responses.filter((r) => r.status === 'submitted');
    const submittedAnswers = submittedRows.map((r) => parseAnswers(r.answersJson));
    const questions = parseQuestions(survey.questionsJson);

    const perQuestion: SurveySummaryQuestion[] = questions.map((q) => {
      const values = submittedAnswers
        .map((ans) => ans.find((a) => a.prompt === q.prompt && a.type === q.type)?.value)
        .filter((v): v is number | string => v !== null && v !== undefined && v !== '');
      if (q.type === 'rating') {
        const nums = values.filter((v): v is number => typeof v === 'number');
        const distribution: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
        for (const n of nums) if (n >= 1 && n <= 5) distribution[String(n)] += 1;
        return { prompt: q.prompt, type: 'rating', count: nums.length, averageRating: nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0, distribution };
      }
      return { prompt: q.prompt, type: 'text', count: values.length, responses: values.filter((v): v is string => typeof v === 'string') };
    });

    return {
      survey: { id: survey.id, name: survey.name },
      totalInvited: responses.length,
      totalSubmitted: submittedRows.length,
      responseRate: responses.length > 0 ? (submittedRows.length / responses.length) * 100 : 0,
      questions: perQuestion,
    };
  }

  // ---- helpers ---------------------------------------------------------------------------------

  private coerceAnswer(q: SurveyQuestion, raw: string | number | null | undefined): number | string | null {
    if (raw === null || raw === undefined || raw === '') return null;
    if (q.type === 'rating') {
      const n = Math.trunc(Number(raw));
      if (!Number.isFinite(n) || n < 1 || n > 5) throw new BadRequestException(`"${q.prompt}" expects a rating from 1 to 5`);
      return n;
    }
    return String(raw).slice(0, 5000);
  }

  private async requireSurvey(context: TenantContext, id: string) {
    const survey = await this.tenantPrisma.forTenant(context, (tx) => tx.surveyDefinition.findFirst({ where: { id } }));
    if (!survey) throw new NotFoundException('Survey not found');
    return survey;
  }

  private validateQuestions(questions: { type: string; prompt: string }[]): void {
    if (questions.length === 0) return; // savable as a draft; can't be enabled/sent until it has questions
    for (const [i, q] of questions.entries()) {
      if (!q.prompt.trim()) throw new BadRequestException(`Question ${i + 1}: prompt is required`);
    }
  }

  private toView(s: { id: string; name: string; enabled: boolean; triggerStage: string | null; questionsJson: string; createdAt: Date; updatedAt: Date }): SurveyView {
    return {
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      triggerStage: s.triggerStage,
      questions: parseQuestions(s.questionsJson),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }
}
