import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { CandidateEmailsService } from '../candidate-emails/candidate-emails.service';
import { UpsertDripCampaignDto, EnrolCandidatesDto } from './dto/drip.dto';

const SUPER_ADMIN: TenantContext = { organizationId: null, isSuperAdmin: true };
const DAY_MS = 24 * 60 * 60 * 1000;
// Bound the work a single sweep does so a large backlog can't hold one long run; the next sweep
// picks up the rest. Hourly cron × 500 = 12k steps/hour/instance ceiling, plenty for email drip.
const SWEEP_BATCH = 500;

export interface DripStep {
  subject: string;
  body: string;
  delayDays: number;
}

function parseSteps(json: string): DripStep[] {
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? (arr as DripStep[]) : [];
  } catch {
    return [];
  }
}

function dueAt(from: Date, delayDays: number): Date {
  return new Date(from.getTime() + Math.max(0, delayDays) * DAY_MS);
}

@Injectable()
export class DripService {
  private readonly logger = new Logger(DripService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly candidateEmails: CandidateEmailsService,
    private readonly audit: AuditService,
  ) {}

  // ---- Campaign CRUD ---------------------------------------------------------------------------

  async list(context: TenantContext) {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const campaigns = await tx.dripCampaign.findMany({ orderBy: { createdAt: 'desc' } });
      // Active-enrolment count per campaign for the list view.
      const active = await tx.dripEnrolment.groupBy({ by: ['campaignId'], where: { status: 'active' }, _count: { _all: true } });
      const activeByCampaign = new Map(active.map((a) => [a.campaignId, a._count._all]));
      return campaigns.map((c) => ({ ...this.toView(c), activeEnrolments: activeByCampaign.get(c.id) ?? 0 }));
    });
  }

  async get(context: TenantContext, id: string) {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const campaign = await tx.dripCampaign.findFirst({ where: { id } });
      if (!campaign) throw new NotFoundException('Campaign not found');
      const counts = await tx.dripEnrolment.groupBy({ by: ['status'], where: { campaignId: id }, _count: { _all: true } });
      const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
      return {
        ...this.toView(campaign),
        enrolments: { active: byStatus.active ?? 0, completed: byStatus.completed ?? 0, exited: byStatus.exited ?? 0 },
      };
    });
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertDripCampaignDto) {
    this.validateSteps(dto.steps);
    const campaign = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.dripCampaign.create({
        data: {
          organizationId: context.organizationId as string,
          name: dto.name,
          enabled: dto.enabled ?? false,
          targetGlobalStage: dto.targetGlobalStage?.trim() || null,
          stepsJson: JSON.stringify(dto.steps),
          createdByUserId: actorUserId,
        },
      }),
    );
    await this.audit.record(context, { actorUserId, action: 'drip_campaign.created', entityType: 'drip_campaign', entityId: campaign.id, metadata: { name: dto.name } });
    return this.toView(campaign);
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpsertDripCampaignDto) {
    this.validateSteps(dto.steps);
    await this.requireCampaign(context, id);
    const campaign = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.dripCampaign.update({
        where: { id },
        data: {
          name: dto.name,
          enabled: dto.enabled ?? false,
          targetGlobalStage: dto.targetGlobalStage?.trim() || null,
          stepsJson: JSON.stringify(dto.steps),
        },
      }),
    );
    await this.audit.record(context, { actorUserId, action: 'drip_campaign.updated', entityType: 'drip_campaign', entityId: id, metadata: { name: dto.name } });
    return this.toView(campaign);
  }

  async setEnabled(context: TenantContext, actorUserId: string, id: string, enabled: boolean) {
    const campaign = await this.requireCampaign(context, id);
    if (enabled && parseSteps(campaign.stepsJson).length === 0) {
      throw new BadRequestException('Add at least one step before enabling the campaign');
    }
    const updated = await this.tenantPrisma.forTenant(context, (tx) => tx.dripCampaign.update({ where: { id }, data: { enabled } }));
    await this.audit.record(context, { actorUserId, action: 'drip_campaign.enabled_changed', entityType: 'drip_campaign', entityId: id, metadata: { enabled } });
    return this.toView(updated);
  }

  async remove(context: TenantContext, actorUserId: string, id: string) {
    await this.requireCampaign(context, id);
    await this.tenantPrisma.forTenant(context, async (tx) => {
      await tx.dripEnrolment.deleteMany({ where: { campaignId: id } });
      await tx.dripCampaign.delete({ where: { id } });
    });
    await this.audit.record(context, { actorUserId, action: 'drip_campaign.deleted', entityType: 'drip_campaign', entityId: id });
    return { deleted: true };
  }

  // ---- Enrolment -------------------------------------------------------------------------------

  // Manual enrol: recruiter picks candidates. Resolves each to their most-recent pipeline entry
  // (drip sends are entry-keyed, like bulk email), skips already-enrolled + candidates with no entry.
  async enrolCandidates(context: TenantContext, actorUserId: string, campaignId: string, dto: EnrolCandidatesDto) {
    const campaign = await this.requireCampaign(context, campaignId);
    const steps = parseSteps(campaign.stepsJson);
    if (steps.length === 0) throw new BadRequestException('This campaign has no steps to send');

    const result = await this.tenantPrisma.forTenant(context, async (tx) => {
      const entries = await tx.pipelineEntry.findMany({
        where: { candidateId: { in: dto.candidateIds } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, candidateId: true },
      });
      const entryByCandidate = new Map<string, string>();
      for (const e of entries) if (!entryByCandidate.has(e.candidateId)) entryByCandidate.set(e.candidateId, e.id);

      const existing = await tx.dripEnrolment.findMany({ where: { campaignId, candidateId: { in: dto.candidateIds } }, select: { candidateId: true } });
      const alreadyEnrolled = new Set(existing.map((e) => e.candidateId));

      const now = new Date();
      const nextStepDueAt = dueAt(now, steps[0].delayDays);
      const toCreate = dto.candidateIds
        .filter((id) => entryByCandidate.has(id) && !alreadyEnrolled.has(id))
        .map((candidateId) => ({
          organizationId: context.organizationId as string,
          campaignId,
          candidateId,
          entryId: entryByCandidate.get(candidateId) as string,
          nextStepDueAt,
        }));
      if (toCreate.length > 0) await tx.dripEnrolment.createMany({ data: toCreate });

      return {
        enrolled: toCreate.length,
        alreadyEnrolled: dto.candidateIds.filter((id) => alreadyEnrolled.has(id)).length,
        noEntry: dto.candidateIds.filter((id) => !entryByCandidate.has(id)).length,
      };
    });
    await this.audit.record(context, { actorUserId, action: 'drip_campaign.enrolled', entityType: 'drip_campaign', entityId: campaignId, metadata: result });
    return result;
  }

  // Auto-enrol hook, called fire-and-forget from pipeline patchEntry after a stage move. Enrols the
  // entry's candidate into every enabled campaign whose targetGlobalStage matches the candidate's new
  // global stage. Idempotent (unique campaign+candidate).
  async enrolOnStageChange(context: TenantContext, entryId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const entry = await tx.pipelineEntry.findUnique({
        where: { id: entryId },
        select: { id: true, candidateId: true, candidate: { select: { globalStage: true } } },
      });
      const globalStage = entry?.candidate?.globalStage;
      if (!entry || !globalStage) return;

      const campaigns = await tx.dripCampaign.findMany({ where: { enabled: true, targetGlobalStage: globalStage } });
      if (campaigns.length === 0) return;

      const existing = await tx.dripEnrolment.findMany({
        where: { candidateId: entry.candidateId, campaignId: { in: campaigns.map((c) => c.id) } },
        select: { campaignId: true },
      });
      const enrolledIn = new Set(existing.map((e) => e.campaignId));
      const now = new Date();
      const toCreate = campaigns
        .filter((c) => !enrolledIn.has(c.id))
        .map((c) => ({ steps: parseSteps(c.stepsJson), campaign: c }))
        .filter((x) => x.steps.length > 0)
        .map((x) => ({
          organizationId: context.organizationId as string,
          campaignId: x.campaign.id,
          candidateId: entry.candidateId,
          entryId: entry.id,
          nextStepDueAt: dueAt(now, x.steps[0].delayDays),
        }));
      if (toCreate.length > 0) await tx.dripEnrolment.createMany({ data: toCreate });
    });
  }

  // Exit hook, called fire-and-forget from pipeline patchEntry on hire. Stops all of a candidate's
  // active drips (a hired candidate should not keep receiving nurture email).
  async exitCandidate(context: TenantContext, candidateId: string, reason: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.dripEnrolment.updateMany({ where: { candidateId, status: 'active' }, data: { status: 'exited', exitReason: reason } }),
    );
  }

  // ---- Scheduled sweep (dispatched by ScheduledSweepsWorkerService as 'drip-steps') ------------

  async sweep(now = new Date()): Promise<void> {
    let due: { id: string; organizationId: string; campaignId: string; entryId: string; currentStepIndex: number }[] = [];
    try {
      due = await this.tenantPrisma.forTenant(SUPER_ADMIN, (tx) =>
        tx.dripEnrolment.findMany({
          where: { status: 'active', nextStepDueAt: { lte: now } },
          orderBy: { nextStepDueAt: 'asc' },
          take: SWEEP_BATCH,
          select: { id: true, organizationId: true, campaignId: true, entryId: true, currentStepIndex: true },
        }),
      );
    } catch (e) {
      this.logger.warn(`Drip sweep: failed to list due enrolments: ${e instanceof Error ? e.message : e}`);
      return;
    }
    for (const enrolment of due) {
      try {
        await this.processEnrolment({ organizationId: enrolment.organizationId, isSuperAdmin: false }, enrolment, now);
      } catch (e) {
        this.logger.error(`Drip sweep: enrolment ${enrolment.id} failed`, e as Error);
      }
    }
  }

  private async processEnrolment(
    context: TenantContext,
    enrolment: { id: string; campaignId: string; entryId: string; currentStepIndex: number },
    now: Date,
  ): Promise<void> {
    const campaign = await this.tenantPrisma.forTenant(context, (tx) => tx.dripCampaign.findFirst({ where: { id: enrolment.campaignId } }));
    if (!campaign) {
      await this.finish(context, enrolment.id, 'exited', 'campaign_deleted');
      return;
    }
    if (!campaign.enabled) {
      // Paused: defer a day rather than sending or exiting, so re-enabling resumes cleanly.
      await this.tenantPrisma.forTenant(context, (tx) => tx.dripEnrolment.update({ where: { id: enrolment.id }, data: { nextStepDueAt: dueAt(now, 1) } }));
      return;
    }
    const steps = parseSteps(campaign.stepsJson);
    if (enrolment.currentStepIndex >= steps.length) {
      await this.finish(context, enrolment.id, 'completed', null);
      return;
    }
    const step = steps[enrolment.currentStepIndex];

    // source:'drip' -> a candidate who opted out is skipped silently (sendMessage returns null)
    // rather than throwing; erased/other failures throw and we exit the enrolment.
    let sent;
    try {
      sent = await this.candidateEmails.sendMessage(context, null, enrolment.entryId, { subject: step.subject, body: step.body, source: 'drip' });
    } catch (e) {
      this.logger.warn(`Drip send failed for enrolment ${enrolment.id}: ${e instanceof Error ? e.message : e}`);
      await this.finish(context, enrolment.id, 'exited', 'send_failed');
      return;
    }
    if (sent === null) {
      await this.finish(context, enrolment.id, 'exited', 'unsubscribed');
      return;
    }

    // Advance: schedule the next step, or complete if this was the last.
    const nextIndex = enrolment.currentStepIndex + 1;
    if (nextIndex >= steps.length) {
      await this.finish(context, enrolment.id, 'completed', null, now);
    } else {
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.dripEnrolment.update({
          where: { id: enrolment.id },
          data: { currentStepIndex: nextIndex, nextStepDueAt: dueAt(now, steps[nextIndex].delayDays), lastSentAt: now },
        }),
      );
    }
  }

  private async finish(context: TenantContext, id: string, status: 'completed' | 'exited', reason: string | null, lastSentAt?: Date): Promise<void> {
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.dripEnrolment.update({ where: { id }, data: { status, exitReason: reason, ...(lastSentAt ? { lastSentAt } : {}) } }),
    );
  }

  // ---- helpers ---------------------------------------------------------------------------------

  private async requireCampaign(context: TenantContext, id: string) {
    const campaign = await this.tenantPrisma.forTenant(context, (tx) => tx.dripCampaign.findFirst({ where: { id } }));
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  private validateSteps(steps: { subject: string; body: string; delayDays: number }[]): void {
    if (steps.length === 0) return; // a campaign can be saved as a draft with no steps; can't be enabled/enrolled
    for (const [i, s] of steps.entries()) {
      if (!s.subject.trim()) throw new BadRequestException(`Step ${i + 1}: subject is required`);
      if (!s.body.trim()) throw new BadRequestException(`Step ${i + 1}: body is required`);
    }
  }

  private toView(c: { id: string; name: string; enabled: boolean; targetGlobalStage: string | null; stepsJson: string; createdAt: Date; updatedAt: Date }) {
    return {
      id: c.id,
      name: c.name,
      enabled: c.enabled,
      targetGlobalStage: c.targetGlobalStage,
      steps: parseSteps(c.stepsJson),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }
}
