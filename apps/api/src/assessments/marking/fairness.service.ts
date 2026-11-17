import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { companySetting } from '../asmt-rules';
import { impactRows, surveySummary, type ImpactRow } from './fairness-rules';

// Assessments AS-6 (answers 2019, 2165): a test's fairness from voluntary answers only, as counts per group, hidden
// below asmt.fairness_min_group; a finding opens a review (keep with a reason, revise or retire). The after-test survey
// is summarised only from 5 answers.

const GROUP: Record<string, string> = { woman: 'Women', man: 'Men', another: 'Another way' };

export interface FairnessView {
  exam: { id: string; title: string };
  minGroup: number;
  /** Candidates with a pass or fail who said how they describe themselves (not "prefer not to say"). */
  described: number;
  rows: ImpactRow[];
  finding: { group: string; ratio: number } | null;
  review: { id: string; finding: string; openedAt: string; decision: string | null; reason: string | null; decidedAt: string | null } | null;
  survey: { responses: number; averageRating: number; clearPercent: number | null } | null;
}

@Injectable()
export class FairnessService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async view(ctx: TenantContext, examId: string): Promise<FairnessView> {
    const org = ctx.organizationId as string;
    return this.tenantPrisma.forTenant(ctx, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: org }, select: { id: true, title: true } });
      if (!exam) throw new NotFoundException('Test not found');
      const minGroup = Number(await companySetting(tx, org, 'asmt.fairness_min_group'));
      // Counts only: the group and the outcome, never who.
      const counts = await tx.$queryRaw<{ gender: string; attempts: number; passed: number }[]>`
        SELECT d.gender, count(*)::int AS attempts, count(*) FILTER (WHERE r.pass_fail = 'pass')::int AS passed
        FROM attempt_self_descriptions d
        JOIN attempts a ON a.id = d.attempt_id AND a.exam_id = ${examId}::uuid
        JOIN results r ON r.attempt_id = a.id AND r.pass_fail IN ('pass', 'fail')
        WHERE d.organization_id = ${org}::uuid AND d.gender <> 'not_say'
        GROUP BY d.gender`;
      const groups = ['man', 'woman', 'another'].map((g) => ({ group: GROUP[g]!, attempts: counts.find((c) => c.gender === g)?.attempts ?? 0, passed: counts.find((c) => c.gender === g)?.passed ?? 0 }));
      const { rows, finding } = impactRows(groups, minGroup);
      const review = await tx.asmtFairnessReview.findFirst({ where: { organizationId: org, examId }, orderBy: { openedAt: 'desc' } });
      const surveys = await tx.attemptSurvey.findMany({ where: { attempt: { examId } }, select: { rating: true, clearInstructions: true }, take: 10000 });
      return {
        exam,
        minGroup,
        described: counts.reduce((n, c) => n + c.attempts, 0),
        rows,
        finding,
        review: review ? { id: review.id, finding: review.finding, openedAt: review.openedAt.toISOString(), decision: review.decision, reason: review.reason, decidedAt: review.decidedAt?.toISOString() ?? null } : null,
        survey: surveySummary(surveys),
      };
    });
  }

  /** A finding opens a review (one open per test). The test stays live; nothing changes for candidates. */
  async openReview(ctx: TenantContext, userId: string, examId: string) {
    const v = await this.view(ctx, examId);
    if (!v.finding) throw new BadRequestException('There is no finding to review.');
    const finding = `Pass rate for ${v.finding.group.toLowerCase()} is ${Math.round(v.finding.ratio * 100)} % of the highest group's`;
    try {
      const r = await this.tenantPrisma.forTenant(ctx, (tx) => tx.asmtFairnessReview.create({ data: { organizationId: ctx.organizationId as string, examId, finding, openedBy: userId } }));
      await this.audit.record(ctx, { actorUserId: userId, action: 'asmt.fairness_review.opened', entityType: 'exam', entityId: examId, metadata: { finding } });
      return { id: r.id };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('A review is already open for this test.');
      throw e;
    }
  }

  /** Keep (with a reason), revise or retire; once. */
  async decide(ctx: TenantContext, userId: string, reviewId: string, decision: 'keep' | 'revise' | 'retire', reason: string) {
    if (reason.trim().length < 10) throw new BadRequestException('Give a reason of at least 10 characters.');
    const n = await this.tenantPrisma.forTenant(ctx, (tx) => tx.asmtFairnessReview.updateMany({ where: { id: reviewId, organizationId: ctx.organizationId as string, decision: null }, data: { decision, reason: reason.trim(), decidedBy: userId, decidedAt: new Date() } }));
    if (!n.count) throw new NotFoundException('No open review to decide.');
    await this.audit.record(ctx, { actorUserId: userId, action: 'asmt.fairness_review.decided', entityType: 'asmt_fairness_review', entityId: reviewId, metadata: { decision } });
    return { decided: true };
  }
}
