import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, TenantContext, OrgSecretsCryptoService } from '@exam-platform/shared';
import { getJobBoardProvider, JobPostingInput } from './providers';

/**
 * Pushes jobs to an org's PAID job boards (LinkedIn / Indeed / generic HTTP) and retracts them when
 * the job is no longer public. One idempotent reconcile per job, called post-commit from the
 * pipeline lifecycle. Best-effort throughout: never throws, so a board API failure can't break a
 * job edit or an approval. Inert when a board has no config (the free XML-feed boards are ignored).
 */
@Injectable()
export class JobBoardPosterService {
  private readonly logger = new Logger(JobBoardPosterService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
  ) {}

  /**
   * Reconcile every paid-board membership of a job against its current public visibility: post to
   * boards where it should be live but isn't, retract from boards where it's live but shouldn't be.
   */
  async syncJobToPaidBoards(context: TenantContext, jobId: string): Promise<void> {
    const orgId = context.organizationId as string;
    const data = await this.tenantPrisma
      .forTenant(context, async (tx) => {
        const job = await tx.job.findFirst({
          where: { id: jobId, organizationId: orgId },
          select: { id: true, title: true, description: true, location: true, employmentType: true, status: true, publicApplyEnabled: true, applyToken: true },
        });
        if (!job) return null;
        const memberships = await tx.jobBoardPublication.findMany({
          where: { jobId, jobBoard: { provider: { not: 'xml_feed' } } },
          select: {
            jobBoardId: true,
            externalPostId: true,
            postStatus: true,
            jobBoard: { select: { provider: true, configEncrypted: true } },
          },
        });
        if (memberships.length === 0) return null;
        const org = await tx.organization.findUnique({ where: { id: orgId }, select: { name: true } });
        return { job, memberships, orgName: org?.name ?? '' };
      })
      .catch(() => null);
    if (!data) return;

    const { job, memberships, orgName } = data;
    // "Live on a board" = the exact public-visibility gate the XML feed uses (open + public apply +
    // a minted token). Anything else means the posting should be retracted.
    const live = job.status === 'open' && job.publicApplyEnabled && Boolean(job.applyToken);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const postingInput: JobPostingInput = {
      title: job.title,
      description: job.description ?? '',
      location: job.location ?? '',
      employmentType: job.employmentType ?? '',
      companyName: orgName,
      applyUrl: job.applyToken ? `${frontendUrl}/apply/${job.applyToken}` : '',
      reference: job.id,
    };

    for (const m of memberships) {
      const adapter = getJobBoardProvider(m.jobBoard.provider);
      if (!adapter || !m.jobBoard.configEncrypted) continue; // unconfigured paid board -> inert
      let config: Record<string, unknown>;
      try {
        config = JSON.parse(this.crypto.decrypt(m.jobBoard.configEncrypted)) as Record<string, unknown>;
      } catch {
        continue;
      }
      try {
        if (live && m.postStatus !== 'posted') {
          const { externalPostId } = await adapter.postJob(config, postingInput);
          await this.writeResult(context, jobId, m.jobBoardId, { externalPostId, postStatus: 'posted', postedAt: new Date(), postError: null });
        } else if (!live && m.postStatus === 'posted' && m.externalPostId) {
          await adapter.closeJob(config, m.externalPostId);
          await this.writeResult(context, jobId, m.jobBoardId, { postStatus: 'removed', postedAt: null });
        }
      } catch (err) {
        this.logger.warn(`Job-board sync failed for job ${jobId} on ${m.jobBoard.provider}: ${String(err)}`);
        await this.writeResult(context, jobId, m.jobBoardId, { postStatus: 'failed', postError: String(err).slice(0, 500) });
      }
    }
  }

  private async writeResult(
    context: TenantContext,
    jobId: string,
    jobBoardId: string,
    data: { externalPostId?: string; postStatus: string; postError?: string | null; postedAt?: Date | null },
  ): Promise<void> {
    await this.tenantPrisma
      .forTenant(context, (tx) =>
        tx.jobBoardPublication.update({ where: { jobBoardId_jobId: { jobBoardId, jobId } }, data }),
      )
      .catch((err) => this.logger.warn(`Could not record job-board post status for job ${jobId}: ${String(err)}`));
  }
}
