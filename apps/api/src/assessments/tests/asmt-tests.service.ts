import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { ExamsService, type PublishCheck } from '../../exams/exams.service';
import type { UpdateExamDto } from '../../exams/dto/update-exam.dto';
import { HIGH_STAKES_KEY, companySetting, modeOf, needsApproval, presetOf, type ProctorMode } from '../asmt-rules';

// Assessments AS-2 (PRC-04 test builder): one test as the designed builder shows it (sections, the blueprint of its
// pool sections, timing, scoring, the proctoring mode and the pre-publish checklist), and the approval a big test needs
// (asmt.high_stakes). Everything else the builder changes goes through the existing /exams routes, which keep their
// own checks (a test is locked once published or started).

type Tx = Prisma.TransactionClient;

export interface BuilderSection {
  id: string;
  title: string;
  weightPercent: number;
  mode: 'fixed' | 'pool';
  questions: number;
  /** Pool sections: how many are drawn, from which tags and difficulty, and how many approved questions match. */
  poolSize: number | null;
  poolDifficulty: string | null;
  poolTags: string[];
  available: number | null;
  requiredCount: number | null;
  targetMinutes: number | null;
  /** Answer 2154: the least percentage of this section's own marks to pass; null = none. */
  cutoffPercent: number | null;
}

export interface BuilderTest {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  passMark: number;
  expectedCandidates: number | null;
  proctoringMode: ProctorMode | 'custom';
  /** AS-6 part 2 (answer 2272): candidates may use the approved assistant; every message is logged. */
  aiAllowed: boolean;
  sections: BuilderSection[];
  checks: PublishCheck[];
  /** Draft and nobody has started it: the builder may change it. */
  editable: boolean;
  approval: {
    needed: boolean;
    threshold: number;
    requestedBy: string | null;
    requestedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    /** The approval still matches the test as it is now. */
    current: boolean;
    /** The viewer may approve (asked for, not theirs, not the author). */
    canApprove: boolean;
  };
  createdAt: string;
}

@Injectable()
export class AsmtTestsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly exams: ExamsService,
    private readonly audit: AuditService,
  ) {}

  private async find(tx: Tx, org: string, id: string) {
    const exam = await tx.exam.findFirst({
      where: { id, organizationId: org },
      include: { sections: { orderBy: { orderIndex: 'asc' }, include: { _count: { select: { questions: true } }, poolTags: { include: { tag: { select: { name: true } } } } } } },
    });
    if (!exam) throw new NotFoundException('Test not found');
    return exam;
  }

  async get(ctx: TenantContext, userId: string, id: string): Promise<BuilderTest> {
    const checks = await this.exams.publishChecks(ctx, id);
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      const exam = await this.find(tx, org, id);
      const threshold = Number(await companySetting(tx, org, HIGH_STAKES_KEY));
      const started = await tx.attempt.count({ where: { examId: id } });
      const names = await this.names(tx, org, [exam.approvalRequestedBy, exam.approvedBy]);
      const sections: BuilderSection[] = [];
      for (const s of exam.sections) {
        const pool = s.selectionMode === 'pool';
        sections.push({
          id: s.id,
          title: s.title,
          weightPercent: s.weightPercent,
          mode: pool ? 'pool' : 'fixed',
          questions: s._count.questions,
          poolSize: pool ? s.poolSize : null,
          poolDifficulty: pool ? s.poolDifficulty : null,
          poolTags: pool ? s.poolTags.map((t) => t.tag.name) : [],
          available: pool
            ? await tx.question.count({ where: { organizationId: org, status: 'active', ...(s.poolDifficulty ? { difficulty: s.poolDifficulty } : {}), AND: s.poolTags.map((t) => ({ tags: { some: { tagId: t.tagId } } })) } })
            : null,
          requiredCount: s.requiredCount,
          targetMinutes: s.targetDurationMinutes,
          cutoffPercent: s.cutoffPercent,
        });
      }
      const current = exam.approvedBy !== null && exam.approvedFingerprint === (await this.exams.fingerprintOf(tx, ctx, id));
      return {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        durationMinutes: exam.durationMinutes,
        passMark: exam.passCriteriaPercent,
        expectedCandidates: exam.expectedCandidates,
        proctoringMode: modeOf(exam),
        aiAllowed: exam.aiAllowed,
        sections,
        checks,
        editable: exam.status === 'draft' && started === 0,
        approval: {
          needed: needsApproval(exam.expectedCandidates, threshold),
          threshold,
          requestedBy: exam.approvalRequestedBy ? (names.get(exam.approvalRequestedBy) ?? 'Someone') : null,
          requestedAt: exam.approvalRequestedAt?.toISOString() ?? null,
          approvedBy: exam.approvedBy ? (names.get(exam.approvedBy) ?? 'Someone') : null,
          approvedAt: exam.approvedAt?.toISOString() ?? null,
          current,
          canApprove: exam.status === 'draft' && exam.approvalRequestedBy !== null && !current && userId !== exam.approvalRequestedBy && userId !== exam.createdBy,
        },
        createdAt: exam.createdAt.toISOString(),
      };
    });
  }

  async defaults(ctx: TenantContext): Promise<{ proctorMode: ProctorMode; highStakes: number }> {
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      return { proctorMode: (await companySetting(tx, org, 'asmt.proctor_mode')) as ProctorMode, highStakes: Number(await companySetting(tx, org, HIGH_STAKES_KEY)) };
    });
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const want = ids.filter((x): x is string => !!x);
    if (!want.length) return new Map<string, string>();
    const users = await tx.user.findMany({ where: { organizationId: org, id: { in: want } }, select: { id: true, name: true, email: true } });
    return new Map(users.map((u) => [u.id, u.name || u.email]));
  }

  /** Answer 2007: set the test's switches to a named mode (through the exams service, which refuses a locked test). */
  async setMode(ctx: TenantContext, userId: string, id: string, mode: ProctorMode) {
    // Only the switches change (an update without a title keeps it).
    await this.exams.update(ctx, userId, id, presetOf(mode) as Partial<UpdateExamDto> as UpdateExamDto);
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.proctoring_mode_set', entityType: 'exam', entityId: id, metadata: { mode } });
    return { mode };
  }

  /** AS-6 part 2 (answer 2272): the AI-allowed switch (a locked test refuses, as any other change). */
  async setAiAllowed(ctx: TenantContext, userId: string, id: string, allowed: boolean) {
    await this.exams.update(ctx, userId, id, { aiAllowed: allowed } as UpdateExamDto);
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.ai_allowed_set', entityType: 'exam', entityId: id, metadata: { allowed } });
    return { aiAllowed: allowed };
  }

  /** asmt.high_stakes: ask another person to approve this test as it is now. */
  async requestApproval(ctx: TenantContext, userId: string, id: string) {
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      const exam = await this.find(tx, org, id);
      if (exam.status !== 'draft') throw new BadRequestException('Only a draft test is approved before publishing.');
      const threshold = Number(await companySetting(tx, org, HIGH_STAKES_KEY));
      if (!needsApproval(exam.expectedCandidates, threshold)) throw new BadRequestException(`Only a test for more than ${threshold} candidates needs an approver. Publish it when the checklist is ready.`);
      // A new request replaces an earlier approval (the test may have changed since).
      await tx.exam.update({ where: { id }, data: { approvalRequestedBy: userId, approvalRequestedAt: new Date(), approvedBy: null, approvedAt: null, approvedFingerprint: null } });
    });
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.approval_requested', entityType: 'exam', entityId: id });
    return { requested: true };
  }

  /** asmt.high_stakes: a second person (neither the asker nor the author) approves the test as it is now. */
  async approve(ctx: TenantContext, userId: string, id: string) {
    const fingerprint = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const org = ctx.organizationId as string;
      const exam = await this.find(tx, org, id);
      if (exam.status !== 'draft') throw new BadRequestException('Only a draft test is approved before publishing.');
      if (!exam.approvalRequestedBy) throw new BadRequestException('Nobody has asked for approval of this test yet.');
      if (userId === exam.approvalRequestedBy || userId === exam.createdBy) throw new ForbiddenException('Another person approves this test: not the one who asked, and not its author.');
      const fp = await this.exams.fingerprintOf(tx, ctx, id);
      if (exam.approvedBy && exam.approvedFingerprint === fp) throw new ConflictException('This test is already approved as it is.');
      await tx.exam.update({ where: { id }, data: { approvedBy: userId, approvedAt: new Date(), approvedFingerprint: fp } });
      return fp;
    });
    await this.audit.record(ctx, { actorUserId: userId, action: 'exam.approved', entityType: 'exam', entityId: id, metadata: { fingerprint } });
    return { approved: true };
  }
}
