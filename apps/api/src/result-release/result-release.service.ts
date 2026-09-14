import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantPrismaService, TenantContext, AuditService, BlobStorageService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';

const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

// Candidate-facing result release. Layers a per-attempt override (Result.releaseOverride) over the
// exam's resultsReleaseMode; the exam-runtime buildFeedback + leaderboard read the same fields to
// decide what a candidate may see. Optionally emails candidates their outcome (recruiter's choice).
@Injectable()
export class ResultReleaseService {
  private readonly logger = new Logger(ResultReleaseService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly blob: BlobStorageService,
  ) {}

  // Release every not-yet-released settled result for an exam at once.
  async releaseExam(context: TenantContext, actorUserId: string | null, examId: string, notify: boolean): Promise<{ released: number }> {
    const orgId = context.organizationId as string;
    const rows = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: orgId }, select: { id: true } });
      if (!exam) throw new NotFoundException(`Exam ${examId} not found`);
      // examId is proven org-owned by the check above; attempts carry examId directly.
      const targets = await tx.result.findMany({
        where: { attempt: { examId }, releaseOverride: { not: 'released' } },
        select: { id: true, attemptId: true },
      });
      if (targets.length > 0) {
        await tx.result.updateMany({
          where: { id: { in: targets.map((t) => t.id) } },
          data: { releaseOverride: 'released', releasedAt: new Date() },
        });
      }
      return targets;
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'results.released',
      entityType: 'exam',
      entityId: examId,
      metadata: { released: rows.length },
    });

    if (notify && rows.length > 0) {
      // Best-effort, fire-and-forget: a large exam's notify shouldn't hold the HTTP response open for
      // minutes of SMTP. Failures are logged, never surfaced. ponytail: inline best-effort; move to
      // the bulk-email queue if per-release volumes grow.
      void this.notifyAttempts(context, rows.map((r) => r.attemptId)).catch((e) =>
        this.logger.error('bulk result-release notify failed', e as Error),
      );
    }
    return { released: rows.length };
  }

  // Release or hold a single attempt's result (per-attempt override, either direction).
  async setAttemptRelease(
    context: TenantContext,
    actorUserId: string | null,
    attemptId: string,
    state: 'released' | 'held',
    notify: boolean,
  ): Promise<{ status: 'released' | 'held' }> {
    const orgId = context.organizationId as string;
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const result = await tx.result.findFirst({
        where: { attemptId, attempt: { invitation: { exam: { organizationId: orgId } } } },
        select: { id: true },
      });
      if (!result) throw new NotFoundException(`No settled result for attempt ${attemptId}`);
      await tx.result.update({
        where: { id: result.id },
        data: { releaseOverride: state, ...(state === 'released' ? { releasedAt: new Date() } : {}) },
      });
    });

    await this.audit.record(context, {
      actorUserId,
      action: state === 'released' ? 'result.released' : 'result.held',
      entityType: 'attempt',
      entityId: attemptId,
    });

    if (state === 'released' && notify) {
      await this.notifyAttempts(context, [attemptId]).catch((e) =>
        this.logger.error(`result-release notify failed for attempt ${attemptId}`, e as Error),
      );
    }
    return { status: state };
  }

  // Emails each candidate their outcome, honoring the exam's feedbackVisibility and the candidate's
  // email opt-out. Reuses the candidate-email HTML shell.
  private async notifyAttempts(context: TenantContext, attemptIds: string[]): Promise<void> {
    const orgId = context.organizationId as string;
    const data = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempts = await tx.attempt.findMany({
        where: { id: { in: attemptIds }, invitation: { exam: { organizationId: orgId } } },
        include: {
          invitation: { include: { candidate: true, exam: { select: { title: true, feedbackVisibility: true } } } },
          result: true,
        },
      });
      const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true, logoPath: true } });
      return { attempts, org };
    });

    const logoUrl = (await this.blob.signIfOurs(data.org?.logoPath ?? null, LOGO_SIGN_TTL_MS)) as string | null;
    for (const attempt of data.attempts) {
      const candidate = attempt.invitation.candidate;
      const exam = attempt.invitation.exam;
      const to = candidate.email;
      if (!to || candidate.emailOptedOutAt) continue;
      const bodyText = this.resultBody(candidate.name, exam.title, exam.feedbackVisibility, attempt.result);
      const html = buildCandidateEmailHtml({ logoUrl, orgName: data.org?.name ?? null, bodyText });
      const res = await this.email.send({ to, subject: `Your results for ${exam.title}`, html, organizationId: orgId });
      if (!res.success) this.logger.warn(`result-release email to ${to} failed`);
    }
  }

  private resultBody(
    name: string,
    examTitle: string,
    visibility: string,
    result: { passFail: string | null; percentage: number } | null,
  ): string {
    const lines = [`Hi ${name},`, '', `Your results for "${examTitle}" have been released.`];
    if (result) {
      if ((visibility === 'pass_fail' || visibility === 'score' || visibility === 'breakdown') && result.passFail) {
        lines.push('', `Outcome: ${result.passFail === 'pass' ? 'Pass' : 'Fail'}`);
      }
      if (visibility === 'score' || visibility === 'breakdown') {
        lines.push(`Score: ${Math.round(result.percentage)}%`);
      }
    }
    lines.push('', 'Sign in to your candidate view for the full details.');
    return lines.join('\n');
  }
}
