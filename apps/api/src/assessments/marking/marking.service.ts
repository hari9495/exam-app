import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { ExamRuntimeInternalClient } from '../../exam-runtime-client/exam-runtime-internal.client';
import { AiInvocationService } from '../../ai/ai-invocation.service';
import { minorState } from '../../talent-crm/minor';
import { companySetting } from '../asmt-rules';
import { markState, nextRound, type MarkState } from './marking-rules';
import { MarkSuggestionClient } from './mark-suggestion.client';

// Assessments AS-6 (PRC-19): the evaluator console. Written, code, file and spoken answers are marked by people:
// blind by default (asmt.blind_marking), by two markers when the company asks (asmt.second_marker) with a moderator when
// their marks are far apart (asmt.moderation_gap), and the AI's suggestion shows only after the person has marked, never
// for an under-18. The final mark goes to the engine through the existing grading route.

const MANUAL = ['code', 'essay', 'file_upload', 'spoken'];
type Tx = Prisma.TransactionClient;

export interface MarkingQueueRow {
  attemptId: string;
  questionId: string;
  test: string;
  examId: string;
  question: string;
  candidate: string;
  /** The round I would mark in (1, 2 or 3 = moderation). */
  round: number;
  submittedAt: string | null;
}

export interface MarkingView {
  attemptId: string;
  questionId: string;
  test: string;
  candidate: string;
  blind: boolean;
  question: { text: string; type: string; marks: number };
  answer: { text: string | null; language: string | null; files: string[] };
  state: MarkState['status'];
  /** My own mark, once I have marked. */
  mine: { marks: number; feedback: string | null; round: number } | null;
  /** The moderator sees the two marks (never the comments). */
  toModerate: { a: number; b: number } | null;
  minor: boolean;
  /** Only after I have marked, and never for an under-18. */
  suggestion: { marks: number; reason: string | null } | null;
  /** Every human-marked answer of this attempt has its final mark: the marking can be finished. */
  attemptReady: boolean;
}

const label = (blind: boolean, attemptId: string, name: string) => (blind ? `Candidate ${attemptId.slice(0, 4).toUpperCase()}` : name);
const files = (json: string | null) => {
  try {
    return json ? (JSON.parse(json) as { fileName?: string }[]).map((f) => f.fileName ?? 'File') : [];
  } catch {
    return [];
  }
};

@Injectable()
export class MarkingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly runtime: ExamRuntimeInternalClient,
    private readonly ai: AiInvocationService,
    private readonly suggester: MarkSuggestionClient,
    private readonly audit: AuditService,
  ) {}

  private async rules(tx: Tx, org: string) {
    return {
      blind: (await companySetting(tx, org, 'asmt.blind_marking')) === 'on',
      double: (await companySetting(tx, org, 'asmt.second_marker')) === 'on',
      gapPercent: Number(await companySetting(tx, org, 'asmt.moderation_gap')),
    };
  }

  /** The answers waiting for me: in a round I may mark (never one I marked; the moderator is neither marker). */
  async queue(ctx: TenantContext, userId: string, examId?: string): Promise<MarkingQueueRow[]> {
    const org = ctx.organizationId as string;
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const r = await this.rules(tx, org);
      const attempts = await tx.attempt.findMany({
        where: { organizationId: org, status: 'pending_manual_grade', ...(examId ? { examId } : {}) },
        orderBy: { submittedAt: 'asc' },
        take: 200,
        select: { id: true, examId: true, submittedAt: true, invitation: { select: { exam: { select: { title: true } }, candidate: { select: { name: true } } } }, answers: { where: { marksAwarded: null, question: { type: { in: MANUAL } } }, select: { questionId: true, question: { select: { text: true, marks: true } } } } },
      });
      const marks = await tx.answerMark.findMany({ where: { attemptId: { in: attempts.map((a) => a.id) } }, select: { attemptId: true, questionId: true, round: true, marks: true, markerUserId: true } });
      const out: MarkingQueueRow[] = [];
      for (const a of attempts)
        for (const ans of a.answers) {
          const rows = marks.filter((m) => m.attemptId === a.id && m.questionId === ans.questionId);
          const next = nextRound(markState(rows, { double: r.double, gapPercent: r.gapPercent, max: ans.question.marks }), rows, userId);
          if ('round' in next) out.push({ attemptId: a.id, questionId: ans.questionId, test: a.invitation.exam.title, examId: a.examId, question: ans.question.text.slice(0, 200), candidate: label(r.blind, a.id, a.invitation.candidate.name), round: next.round, submittedAt: a.submittedAt?.toISOString() ?? null });
        }
      return out;
    });
  }

  private async load(tx: Tx, org: string, attemptId: string, questionId: string) {
    const a = await tx.attempt.findFirst({
      where: { id: attemptId, organizationId: org },
      select: { id: true, status: true, candidateId: true, submittedAt: true, invitation: { select: { exam: { select: { title: true } }, candidate: { select: { name: true } } } }, answers: { select: { questionId: true, answerText: true, codeLanguage: true, answerFilesJson: true, marksAwarded: true, question: { select: { text: true, type: true, marks: true } } } } },
    });
    const ans = a?.answers.find((x) => x.questionId === questionId);
    if (!a || !ans || !MANUAL.includes(ans.question.type)) throw new NotFoundException('Answer not found');
    return { a, ans };
  }

  async view(ctx: TenantContext, userId: string, attemptId: string, questionId: string): Promise<MarkingView> {
    const org = ctx.organizationId as string;
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const r = await this.rules(tx, org);
      const { a, ans } = await this.load(tx, org, attemptId, questionId);
      const rows = await tx.answerMark.findMany({ where: { attemptId, questionId }, orderBy: { round: 'asc' } });
      const state = markState(rows, { double: r.double, gapPercent: r.gapPercent, max: ans.question.marks });
      const mine = rows.find((m) => m.markerUserId === userId) ?? null;
      const day = (a.submittedAt ?? new Date()).toISOString().slice(0, 10);
      const minor = (await minorState(tx, org, a.candidateId, day)).minor;
      const s = mine && !minor ? await tx.answerAiSuggestion.findUnique({ where: { attemptId_questionId: { attemptId, questionId } } }) : null;
      const manual = a.answers.filter((x) => MANUAL.includes(x.question.type));
      return {
        attemptId,
        questionId,
        test: a.invitation.exam.title,
        candidate: label(r.blind, a.id, a.invitation.candidate.name),
        blind: r.blind,
        question: { text: ans.question.text, type: ans.question.type, marks: ans.question.marks },
        answer: { text: ans.answerText, language: ans.codeLanguage, files: files(ans.answerFilesJson) },
        state: state.status,
        mine: mine ? { marks: mine.marks, feedback: mine.feedback, round: mine.round } : null,
        toModerate: state.status === 'needs_moderation' && !mine ? { a: state.a, b: state.b } : null,
        minor,
        suggestion: s ? { marks: s.marks, reason: s.reason } : null,
        attemptReady: a.status === 'pending_manual_grade' && manual.every((x) => x.marksAwarded !== null),
      };
    });
  }

  /** My mark: recorded in my round; when it settles the answer, the final mark goes to the engine. */
  async mark(ctx: TenantContext, userId: string, attemptId: string, questionId: string, marks: number, feedback: string | null) {
    const org = ctx.organizationId as string;
    const settled = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const r = await this.rules(tx, org);
      const { a, ans } = await this.load(tx, org, attemptId, questionId);
      if (a.status !== 'pending_manual_grade') throw new ConflictException('This attempt is not waiting for marking.');
      if (marks > ans.question.marks) throw new BadRequestException(`This question is out of ${ans.question.marks} marks.`);
      const o = { double: r.double, gapPercent: r.gapPercent, max: ans.question.marks };
      const rows = await tx.answerMark.findMany({ where: { attemptId, questionId } });
      const next = nextRound(markState(rows, o), rows, userId);
      if ('refused' in next) throw new ConflictException(next.refused);
      try {
        await tx.answerMark.create({ data: { attemptId, questionId, markerUserId: userId, round: next.round, marks, feedback: feedback?.trim() || null } });
      } catch (e) {
        // Someone else took this round at the same moment: reload and mark the next one.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Someone else marked this answer just now. Reload it.');
        throw e;
      }
      const after = markState([...rows, { round: next.round, marks, markerUserId: userId }], o);
      return { round: next.round, final: after.status === 'final' ? after.marks : null, status: after.status };
    });
    if (settled.final !== null) await this.runtime.gradeCodeAnswer(attemptId, questionId, { marksAwarded: settled.final, ...(feedback?.trim() ? { feedback: feedback.trim() } : {}) });
    await this.audit.record(ctx, { actorUserId: userId, action: 'answer.marked', entityType: 'attempt', entityId: attemptId, metadata: { questionId, round: settled.round, final: settled.final } });
    return settled;
  }

  /** The AI's suggestion, only for someone who has marked this answer, never for an under-18; asked once, then kept. */
  async suggestion(ctx: TenantContext, userId: string, attemptId: string, questionId: string) {
    const org = ctx.organizationId as string;
    const ready = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const { a, ans } = await this.load(tx, org, attemptId, questionId);
      if (!(await tx.answerMark.findFirst({ where: { attemptId, questionId, markerUserId: userId }, select: { id: true } }))) throw new BadRequestException('Enter your own mark first; the suggestion shows after it.');
      if ((await minorState(tx, org, a.candidateId, (a.submittedAt ?? new Date()).toISOString().slice(0, 10))).minor) throw new BadRequestException('Under-18 test-taker: human marking only, no AI suggestion.');
      if (ans.question.type !== 'essay' && ans.question.type !== 'code') throw new BadRequestException('There is no AI suggestion for files or recordings.');
      const kept = await tx.answerAiSuggestion.findUnique({ where: { attemptId_questionId: { attemptId, questionId } } });
      return { kept, ans };
    });
    if (ready.kept) return { marks: ready.kept.marks, reason: ready.kept.reason };
    const s = await this.ai.run(ctx, { source: 'asmt.mark_suggestion', sourceId: attemptId }, (p) => this.suggester.suggest({ question: ready.ans.question.text, max: ready.ans.question.marks, answer: ready.ans.answerText ?? '', language: ready.ans.question.type === 'code' ? ready.ans.codeLanguage : null }, p));
    await this.tenantPrisma.forTenant(ctx, (tx) => tx.answerAiSuggestion.upsert({ where: { attemptId_questionId: { attemptId, questionId } }, create: { attemptId, questionId, marks: s.marks, reason: s.reason }, update: {} }));
    return s;
  }
}
