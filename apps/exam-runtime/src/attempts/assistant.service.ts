import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiApiKeyResolverService, TenantPrismaService } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';

// AS-6 part 2 (answer 2272): the approved assistant of an AI-allowed test. Every question and answer is kept on the
// attempt's record (asmt_assistant_messages, which the runtime may not rewrite) for the markers. A company limits the
// answered questions per attempt (asmt.assistant_turns); a failed answer does not use one up.

export interface AssistantMessage {
  id: string;
  role: 'candidate' | 'assistant';
  body: string;
  questionId: string | null;
  at: string;
}
export interface AssistantView {
  limit: number;
  turnsLeft: number;
  log: AssistantMessage[];
}

const TURN_VALUES = [10, 20, 40, 60];
const CONTEXT_TURNS = 10;
const PROMPT =
  'You are the approved AI assistant inside an AI-allowed hiring test. The candidate may ask you anything that helps them ' +
  'work: explain ideas, draft or review code or text, check facts. Answer plainly and briefly. You do not know the test ' +
  'questions or the marking unless the candidate tells you. Never claim to know what the markers expect.';

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
    private readonly quota: QuotaService,
  ) {}

  /** The signed-in candidate's attempt on an AI-allowed test (a system read by the session's invitation). */
  private async attemptOf(session: CandidateSession) {
    const found = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({ where: { id: session.invitationId }, select: { organizationId: true, exam: { select: { aiAllowed: true } }, attempt: { select: { id: true, status: true, questionOrderJson: true } } } }),
    );
    if (!found?.organizationId) throw new UnauthorizedException('Invalid candidate session');
    if (!found.exam.aiAllowed) throw new ForbiddenException('This test does not allow the assistant.');
    if (!found.attempt) throw new BadRequestException('Start the test first.');
    return { org: found.organizationId, attempt: found.attempt };
  }

  async view(session: CandidateSession): Promise<AssistantView> {
    const { org, attempt } = await this.attemptOf(session);
    return this.tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, (tx) => viewOf(tx, org, attempt.id));
  }

  async ask(session: CandidateSession, text: string, questionId: string | null): Promise<AssistantView> {
    const message = text.trim();
    if (!message) throw new BadRequestException('Write your question first.');
    const { org, attempt } = await this.attemptOf(session);
    if (attempt.status !== 'in_progress') throw new BadRequestException('The assistant is available while your test is running.');
    if (questionId && !(JSON.parse(attempt.questionOrderJson) as string[]).includes(questionId)) throw new BadRequestException('That question is not in your test.');
    const ctx = { organizationId: org, isSuperAdmin: false };
    // shortcut: two questions sent at the same moment may both pass the limit check (one over at most); a lock if it matters.
    const history = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const v = await viewOf(tx, org, attempt.id);
      if (v.turnsLeft <= 0) throw new ConflictException(`You have used all ${v.limit} questions to the assistant for this test.`);
      await tx.asmtAssistantMessage.create({ data: { attemptId: attempt.id, questionId, role: 'candidate', body: message } });
      return v.log.slice(-CONTEXT_TURNS * 2);
    });
    let reply: string;
    try {
      await this.quota.assertAiCredits(ctx);
      const ai = await this.aiApiKeyResolver.resolve(org);
      const transcript = history.map((m) => `${m.role === 'candidate' ? 'Candidate' : 'Assistant'}: ${m.body}`).join('\n\n');
      const out = await ai.generateStructured({
        modelTier: 'standard',
        maxTokens: 1024,
        prompt: `${PROMPT}\n\n${transcript ? `The conversation so far:\n\n${transcript}\n\n` : ''}Candidate: ${message}`,
        tool: { name: 'reply_to_candidate', description: 'Reply to the candidate.', schema: { type: 'object', properties: { reply: { type: 'string', description: 'The reply, in plain language.' } }, required: ['reply'] } },
      });
      if (typeof out.reply !== 'string' || !out.reply.trim()) throw new Error('empty reply');
      reply = out.reply.trim().slice(0, 8000);
    } catch (error) {
      this.logger.warn(`Assistant failed for attempt ${attempt.id}: ${error instanceof Error ? error.message : String(error)}`);
      throw new ServiceUnavailableException('The assistant could not answer just now. Your question is kept in the log and does not count; try again.');
    }
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      await tx.asmtAssistantMessage.create({ data: { attemptId: attempt.id, questionId, role: 'assistant', body: reply } });
      await tx.aiCreditUsage.create({ data: { organizationId: org, source: 'test_assistant', credits: 1, sourceId: attempt.id } });
      return viewOf(tx, org, attempt.id);
    });
  }
}

async function viewOf(tx: Prisma.TransactionClient, org: string, attemptId: string): Promise<AssistantView> {
  const row = await tx.setting.findFirst({ where: { organizationId: org, key: 'asmt.assistant_turns', scopeType: 'tenant' }, select: { value: true } });
  const n = Number(row?.value);
  const limit = TURN_VALUES.includes(n) ? n : 20;
  const rows = await tx.asmtAssistantMessage.findMany({ where: { attemptId }, orderBy: { createdAt: 'asc' }, take: 500 });
  const answered = rows.filter((r) => r.role === 'assistant').length;
  return {
    limit,
    turnsLeft: Math.max(0, limit - answered),
    log: rows.map((r) => ({ id: r.id, role: r.role as 'candidate' | 'assistant', body: r.body, questionId: r.questionId, at: r.createdAt.toISOString() })),
  };
}
