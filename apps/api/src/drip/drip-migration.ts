import { randomUUID } from 'crypto';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService, TenantPrismaService } from '@exam-platform/shared';
import type { Step } from '../talent-crm/crm-rules';

type Tx = Prisma.TransactionClient;
const PLATFORM = { organizationId: null, isSuperAdmin: true };
/** A HIR-20 wait is 1 to 60 days. */
const MAX_WAIT = 60;

/** A drip's steps ({subject, body, delayDays}) as HIR-20 steps: a wait (split into 60-day waits) before each message. */
export function dripToSteps(drip: { subject: string; body: string; delayDays: number }[], templateIds: string[]): Step[] {
  const out: Step[] = [];
  drip.forEach((s, i) => {
    for (let left = Math.max(0, Math.round(s.delayDays)); left > 0; left -= MAX_WAIT) out.push({ kind: 'wait', days: Math.min(left, MAX_WAIT) });
    out.push({ kind: 'message', templateId: templateIds[i]! });
  });
  return out;
}

/**
 * Retire /v2, answers 2433, 2512 and 2513 (founder, 18 Nov 2026): each older drip campaign becomes a DRAFT HIR-20 talent
 * campaign, once. Each step's subject and body becomes a candidate email template; each delay a wait; the campaign gets
 * its own empty talent pool. Nobody is moved into the pool (talent-pool consent is the recruiter's to collect), and the
 * drip's "enrol at stage X" has no HIR-20 equivalent, so the draft says so. The drip is switched off and its active
 * enrolments end with the reason 'migrated'.
 *
 * Safe to run again: the drip row is claimed (migrated_campaign_id null → the new id) in the same transaction that makes
 * the campaign, so it moves once even with two API instances. Runs at start-up; a no-op once every drip has moved.
 */
@Injectable()
export class DripMigration implements OnApplicationBootstrap {
  private readonly logger = new Logger(DripMigration.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async onApplicationBootstrap() {
    try {
      const moved = await this.run();
      if (moved) this.logger.log(`Moved ${moved} drip campaign(s) into HIR-20 campaigns.`);
    } catch (e) {
      this.logger.error('Moving drip campaigns failed; they stay as they are until the next start.', e as Error);
    }
  }

  async run(): Promise<number> {
    const left = await this.tenantPrisma.forTenant(PLATFORM, (tx) => tx.dripCampaign.findMany({ where: { migratedCampaignId: null }, select: { id: true, organizationId: true }, orderBy: { createdAt: 'asc' } }));
    let moved = 0;
    for (const d of left) {
      try {
        if (await this.tenantPrisma.forTenant({ organizationId: d.organizationId, isSuperAdmin: false }, (tx) => this.moveOne(tx, d.organizationId, d.id))) moved++;
      } catch (e) {
        this.logger.error(`Drip campaign ${d.id} could not move: ${(e as Error).message}`);
      }
    }
    return moved;
  }

  private async moveOne(tx: Tx, org: string, id: string): Promise<boolean> {
    const campaignId = randomUUID();
    const claimed = await tx.dripCampaign.updateMany({ where: { id, organizationId: org, migratedCampaignId: null }, data: { migratedCampaignId: campaignId, enabled: false } });
    if (claimed.count !== 1) return false;
    const drip = await tx.dripCampaign.findFirstOrThrow({ where: { id } });
    let parsed: { subject: string; body: string; delayDays: number }[] = [];
    try {
      const v = JSON.parse(drip.stepsJson) as unknown;
      if (Array.isArray(v)) parsed = v.filter((s) => s && typeof s.subject === 'string' && typeof s.body === 'string').map((s) => ({ subject: s.subject, body: s.body, delayDays: Number(s.delayDays) || 0 }));
    } catch {
      parsed = [];
    }
    const name = drip.name.trim().slice(0, 90) || 'Drip campaign';
    const templateIds: string[] = [];
    for (const [i, s] of parsed.entries()) {
      const t = await tx.candidateEmailTemplate.create({ data: { organizationId: org, name: `${name} · step ${i + 1}`, triggerMode: 'manual', subject: s.subject, body: s.body, enabled: true } });
      templateIds.push(t.id);
    }
    const stage = drip.targetGlobalStage ? ` It used to enrol people automatically when they reached the "${drip.targetGlobalStage}" stage; add people by hand now.` : '';
    const pool = await tx.talentPool.create({
      data: { organizationId: org, name: `From drip: ${name} (${id.slice(0, 4)})`, kind: 'pool', description: `Made when the drip campaign "${name}" moved to campaigns. Add people who gave talent-pool consent.${stage}`.slice(0, 500), ownerUserId: drip.createdByUserId },
    });
    await tx.talentCampaign.create({
      data: { id: campaignId, organizationId: org, name: `${name} (from drip)`.slice(0, 120), channel: 'email', poolId: pool.id, steps: dripToSteps(parsed, templateIds) as unknown as Prisma.InputJsonValue, status: 'draft', createdBy: drip.createdByUserId },
    });
    const ended = await tx.dripEnrolment.updateMany({ where: { organizationId: org, campaignId: id, status: 'active' }, data: { status: 'exited', exitReason: 'migrated' } });
    await AuditService.recordIn(tx, { organizationId: org, isSuperAdmin: false }, { actorUserId: null, action: 'drip_campaign.migrated', entityType: 'drip_campaign', entityId: id, metadata: { campaignId, poolId: pool.id, steps: parsed.length, enrolmentsEnded: ended.count, stage: drip.targetGlobalStage } });
    return true;
  }
}
