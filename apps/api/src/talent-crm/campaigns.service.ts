import { randomUUID } from 'crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { settingFor } from '../people/probation';
import { todayIst } from '../org-structure/org-validation';
import { poolConsented } from '../talent/pools.service';
import { EmailService } from '../email/email.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { getWhatsappProvider } from '../whatsapp/providers';
import { buildCandidateEmailHtml, renderTemplate } from '../candidate-emails/candidate-email-render';
import { Channel, Skip, Step, audienceSkip, inWindow, istDayStart, validSteps } from './crm-rules';
import { minorState } from './minor';

const LOGO_SIGN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const SWEEP_BATCH = 500;
const FRONTEND = () => process.env.FRONTEND_URL ?? 'http://localhost:3000';

export interface CampaignInput {
  name: string;
  channel: Channel;
  poolId: string;
  steps: unknown;
  stopOnReply: boolean;
  stopOnApply: boolean;
}

type Member = { id: string; organizationId: string; campaignId: string; candidateId: string; stepIndex: number; enrolledAt: Date };

/**
 * HIR-20 Talent CRM campaigns (YX-ATS-20/22). A campaign sends a sequence of steps (a message from the company's
 * candidate templates, or a wait) to the members of one talent pool who may get it: talent-pool consent plus the
 * channel's opt-in (email: not unsubscribed; WhatsApp: the candidate opted in, and only when a WhatsApp provider is
 * connected); under 18 never. The 'crm-campaigns' sweep sends due steps inside the company's send window and under its
 * daily cap; each step goes to a person once (a claimed send row, unique per member and step) and every send is a row
 * and an audit entry. A person stops on unsubscribe, consent withdrawn, hire, erasure, a reply (recorded by the
 * recruiter) or an application, as the campaign says.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  /** Is a WhatsApp provider set up and switched on? Without one, WhatsApp campaigns show "not connected". */
  private async whatsappConnected(org: string): Promise<boolean> {
    const o = await this.prisma.organization.findUnique({ where: { id: org }, select: { whatsappEnabled: true, whatsappProvider: true, whatsappConfigEncrypted: true } });
    return Boolean(o?.whatsappEnabled && o.whatsappConfigEncrypted && getWhatsappProvider(o.whatsappProvider ?? ''));
  }

  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.talentCampaign.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'desc' } });
      const pools = await tx.talentPool.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.poolId) } }, select: { id: true, name: true } });
      const counts = await tx.talentCampaignMember.groupBy({ by: ['campaignId', 'status', 'stopReason'], where: { organizationId: org, campaignId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
      const sent = await tx.talentCampaignSend.groupBy({ by: ['campaignId'], where: { organizationId: org, campaignId: { in: rows.map((r) => r.id) }, status: 'sent' }, _count: { _all: true } });
      const [emailT, waT, window, cap] = await Promise.all([
        tx.candidateEmailTemplate.findMany({ where: { organizationId: org, enabled: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        tx.candidateWhatsappTemplate.findMany({ where: { organizationId: org, enabled: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
        settingFor(tx, c, 'hiring.crm.send_window', { legalEntityId: '' }),
        settingFor(tx, c, 'hiring.crm.daily_cap', { legalEntityId: '' }),
      ]);
      const n = (id: string, f: (r: (typeof counts)[number]) => boolean) => counts.filter((r) => r.campaignId === id && f(r)).reduce((a, r) => a + r._count._all, 0);
      return {
        campaigns: rows.map((r) => ({
          id: r.id,
          name: r.name,
          channel: r.channel,
          poolId: r.poolId,
          poolName: pools.find((p) => p.id === r.poolId)?.name ?? null,
          steps: r.steps,
          stopOnReply: r.stopOnReply,
          stopOnApply: r.stopOnApply,
          status: r.status,
          createdAt: r.createdAt,
          startedAt: r.startedAt,
          counts: {
            enrolled: n(r.id, () => true),
            active: n(r.id, (x) => x.status === 'active'),
            replied: n(r.id, (x) => x.stopReason === 'replied'),
            applied: n(r.id, (x) => x.stopReason === 'applied'),
            optedOut: n(r.id, (x) => x.stopReason === 'opted_out' || x.stopReason === 'no_consent'),
            sent: sent.find((s) => s.campaignId === r.id)?._count._all ?? 0,
          },
        })),
        templates: { email: emailT, whatsapp: waT },
        whatsappConnected: await this.whatsappConnected(org),
        window,
        dailyCap: Number(cap),
      };
    });
  }

  /** Who in the pool would get it, and why the rest would not (the builder's "Who gets it"). */
  private async audience(tx: Tx, org: string, poolId: string, channel: Channel) {
    const pool = await tx.talentPool.findFirst({ where: { id: poolId, organizationId: org, archivedAt: null }, select: { id: true, kind: true, name: true } });
    if (!pool) throw new NotFoundException('Pool not found.');
    const ids = (await tx.talentPoolMember.findMany({ where: { organizationId: org, poolId }, select: { candidateId: true } })).map((m) => m.candidateId);
    const people = await tx.candidate.findMany({ where: { organizationId: org, id: { in: ids }, mergedIntoId: null }, select: { id: true, phone: true, erasedAt: true, emailOptedOutAt: true, whatsappOptedOutAt: true, whatsappOptedInAt: true } });
    const consented = await poolConsented(tx, org, ids);
    const day = todayIst();
    const enrolled: string[] = [];
    const skipped: Record<Skip, number> = { no_consent: 0, opted_out: 0, minor: 0, erased: 0 };
    for (const p of people) {
      const m = await minorState(tx, org, p.id, day);
      const skip = audienceSkip(
        { poolConsent: consented.has(p.id), emailOptedOut: Boolean(p.emailOptedOutAt), whatsappOptedIn: Boolean(p.whatsappOptedInAt), whatsappOptedOut: Boolean(p.whatsappOptedOutAt), hasPhone: Boolean(p.phone?.trim()), minor: m.minor, erased: Boolean(p.erasedAt) },
        channel,
      );
      if (skip) skipped[skip]++;
      else enrolled.push(p.id);
    }
    return { pool, enrolled, total: people.length, skipped: { noConsent: skipped.no_consent, optedOut: skipped.opted_out, minor: skipped.minor, erased: skipped.erased } };
  }

  preview(ctx: TenantContext, poolId: string, channel: Channel) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const a = await this.audience(tx, c.organizationId, poolId, channel);
      return { total: a.total, enrolled: a.enrolled.length, skipped: a.skipped };
    });
  }

  /** Templates must be the company's own, enabled, of the campaign's channel. */
  private async checkSteps(tx: Tx, org: string, channel: Channel, raw: unknown): Promise<Step[]> {
    const steps = validSteps(raw);
    if (typeof steps === 'string') throw new ConflictException(steps);
    const ids = [...new Set(steps.flatMap((s) => (s.kind === 'message' ? [s.templateId] : [])))];
    const found = channel === 'email'
      ? await tx.candidateEmailTemplate.count({ where: { organizationId: org, enabled: true, id: { in: ids } } })
      : await tx.candidateWhatsappTemplate.count({ where: { organizationId: org, enabled: true, id: { in: ids } } });
    if (found !== ids.length) throw new ConflictException(`Choose ${channel === 'email' ? 'email' : 'WhatsApp'} templates of this company for every message step.`);
    return steps;
  }

  /** Saves a draft, or saves and starts (enrols the audience; the sweep sends the first step). */
  create(ctx: TenantContext, dto: CampaignInput & { start: boolean }) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const pool = await tx.talentPool.findFirst({ where: { id: dto.poolId, organizationId: org, archivedAt: null }, select: { id: true } });
      if (!pool) throw new NotFoundException('Pool not found.');
      const steps = await this.checkSteps(tx, org, dto.channel, dto.steps);
      const row = await tx.talentCampaign.create({ data: { organizationId: org, name: dto.name.trim(), channel: dto.channel, poolId: dto.poolId, steps: steps as unknown as Prisma.InputJsonValue, stopOnReply: dto.stopOnReply, stopOnApply: dto.stopOnApply, createdBy: c.userId ?? null } });
      await audit(tx, c, 'ats.campaign.created', 'talent_campaign', row.id, { channel: dto.channel, steps: steps.length });
      const started = dto.start ? await this.begin(tx, c, row.id) : null;
      return { id: row.id, status: started ? 'running' : 'draft', enrolled: started?.enrolled ?? 0 };
    });
  }

  start(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const r = await this.begin(tx, c, id);
      return { id, status: 'running', enrolled: r.enrolled };
    });
  }

  private async begin(tx: Tx, c: CompanyContext, id: string) {
    const org = c.organizationId;
    const camp = await tx.talentCampaign.findFirst({ where: { id, organizationId: org } });
    if (!camp) throw new NotFoundException('Campaign not found.');
    if (camp.status !== 'draft') throw new ConflictException('This campaign has already started.');
    if (camp.channel === 'whatsapp' && !(await this.whatsappConnected(org))) throw new ConflictException('WhatsApp is not connected. Set up a WhatsApp provider in Settings first, or use email.');
    await this.checkSteps(tx, org, camp.channel as Channel, camp.steps);
    const a = await this.audience(tx, org, camp.poolId, camp.channel as Channel);
    if (a.enrolled.length === 0) throw new ConflictException('Nobody in this pool can get it: no one has talent-pool consent and the channel opt-in.');
    const now = new Date();
    await tx.talentCampaignMember.createMany({ data: a.enrolled.map((candidateId) => ({ organizationId: org, campaignId: id, candidateId, nextDueAt: now })), skipDuplicates: true });
    await tx.talentCampaign.update({ where: { id }, data: { status: 'running', startedAt: now } });
    await audit(tx, c, 'ats.campaign.started', 'talent_campaign', id, { enrolled: a.enrolled.length, skipped: a.skipped });
    return { enrolled: a.enrolled.length };
  }

  stop(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { count } = await tx.talentCampaign.updateMany({ where: { id, organizationId: c.organizationId, status: { in: ['draft', 'running'] } }, data: { status: 'stopped' } });
      if (!count) {
        if (!(await tx.talentCampaign.findFirst({ where: { id, organizationId: c.organizationId }, select: { id: true } }))) throw new NotFoundException('Campaign not found.');
        throw new ConflictException('This campaign has already ended.');
      }
      await tx.talentCampaignMember.updateMany({ where: { organizationId: c.organizationId, campaignId: id, status: 'active' }, data: { status: 'stopped', stopReason: 'campaign_stopped', endedAt: new Date() } });
      await audit(tx, c, 'ats.campaign.stopped', 'talent_campaign', id);
      return { id, status: 'stopped' };
    });
  }

  members(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      if (!(await tx.talentCampaign.findFirst({ where: { id, organizationId: org }, select: { id: true } }))) throw new NotFoundException('Campaign not found.');
      const rows = await tx.talentCampaignMember.findMany({ where: { organizationId: org, campaignId: id }, orderBy: { enrolledAt: 'asc' } });
      const people = await tx.candidate.findMany({ where: { organizationId: org, id: { in: rows.map((r) => r.candidateId) } }, select: { id: true, name: true, email: true, erasedAt: true } });
      return rows.map((r) => {
        const p = people.find((x) => x.id === r.candidateId);
        return { candidateId: r.candidateId, name: p && !p.erasedAt ? p.name : 'Erased', email: p && !p.erasedAt ? p.email : null, status: r.status, stopReason: r.stopReason, stepIndex: r.stepIndex, enrolledAt: r.enrolledAt, endedAt: r.endedAt };
      });
    });
  }

  /** The recruiter records a reply (by email or phone): the person stops when the campaign stops on replies. */
  replied(ctx: TenantContext, id: string, candidateId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const camp = await tx.talentCampaign.findFirst({ where: { id, organizationId: org }, select: { stopOnReply: true } });
      if (!camp) throw new NotFoundException('Campaign not found.');
      const m = await tx.talentCampaignMember.findFirst({ where: { organizationId: org, campaignId: id, candidateId } });
      if (!m) throw new NotFoundException('This person is not in the campaign.');
      if (m.status !== 'active') throw new ConflictException('This person no longer gets the campaign.');
      if (!camp.stopOnReply) throw new ConflictException('This campaign does not stop on replies.');
      await tx.talentCampaignMember.update({ where: { id: m.id }, data: { status: 'stopped', stopReason: 'replied', endedAt: new Date() } });
      await audit(tx, c, 'ats.campaign.replied', 'talent_campaign', id, { candidateId });
      return { stopped: true };
    });
  }

  /** One candidate's campaign history and channel consent (the engagement timeline). */
  engagement(ctx: TenantContext, candidateId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const cand = await tx.candidate.findFirst({ where: { organizationId: org, id: candidateId }, select: { id: true, name: true, erasedAt: true, emailOptedOutAt: true, whatsappOptedInAt: true, whatsappOptedOutAt: true } });
      if (!cand || cand.erasedAt) throw new NotFoundException('Candidate not found.');
      const [members, sends] = await Promise.all([
        tx.talentCampaignMember.findMany({ where: { organizationId: org, candidateId } }),
        tx.talentCampaignSend.findMany({ where: { organizationId: org, candidateId }, orderBy: { sentAt: 'desc' }, take: 200 }),
      ]);
      const camps = await tx.talentCampaign.findMany({ where: { organizationId: org, id: { in: members.map((m) => m.campaignId) } }, select: { id: true, name: true } });
      const name = (id: string) => camps.find((x) => x.id === id)?.name ?? 'Campaign';
      const items = [
        ...members.map((m) => ({ id: `e-${m.id}`, at: m.enrolledAt, kind: 'enrolled' as const, campaign: name(m.campaignId), step: null, channel: null, reason: null })),
        ...members.filter((m) => m.status === 'stopped' && m.endedAt).map((m) => ({ id: `s-${m.id}`, at: m.endedAt!, kind: 'stopped' as const, campaign: name(m.campaignId), step: null, channel: null, reason: m.stopReason })),
        ...sends.map((s) => ({ id: s.id, at: s.sentAt, kind: s.status === 'sent' ? ('sent' as const) : ('failed' as const), campaign: name(s.campaignId), step: s.stepIndex + 1, channel: s.channel, reason: null })),
      ].sort((a, b) => b.at.getTime() - a.at.getTime());
      return {
        name: cand.name,
        consent: { email: cand.emailOptedOutAt ? 'opted-out' : 'opted-in', whatsapp: cand.whatsappOptedOutAt ? 'opted-out' : cand.whatsappOptedInAt ? 'opted-in' : 'none' },
        items,
      };
    });
  }

  // ---- the 'crm-campaigns' sweep ---------------------------------------------------------------

  async sweep(now = new Date()): Promise<{ sent: number; stopped: number }> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.talentCampaignMember.findMany({ where: { status: 'active', nextDueAt: { lte: now } }, orderBy: { nextDueAt: 'asc' }, take: SWEEP_BATCH, select: { id: true, organizationId: true, campaignId: true, candidateId: true, stepIndex: true, enrolledAt: true } }),
    );
    let sent = 0;
    let stopped = 0;
    for (const org of [...new Set(due.map((d) => d.organizationId))]) {
      try {
        const r = await this.sweepCompany(org, due.filter((d) => d.organizationId === org), now);
        sent += r.sent;
        stopped += r.stopped;
      } catch (e) {
        this.logger.error(`Campaign sweep failed for a company: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { sent, stopped };
  }

  private async sweepCompany(org: string, members: Member[], now: Date) {
    const ctx: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null, role: null, supportSessionId: null };
    const { window, cap, already } = await this.tenantPrisma.forTenant(ctx, async (tx) => ({
      window: await settingFor(tx, ctx, 'hiring.crm.send_window', { legalEntityId: '' }),
      cap: Number(await settingFor(tx, ctx, 'hiring.crm.daily_cap', { legalEntityId: '' })),
      already: await tx.talentCampaignSend.count({ where: { organizationId: org, sentAt: { gte: istDayStart(now) } } }),
    }));
    // Outside the window or over the cap: nothing is due-dated forward; the next run inside the window picks them up.
    if (!inWindow(window, now)) return { sent: 0, stopped: 0 };
    let budget = cap - already;
    let sent = 0;
    let stopped = 0;
    for (const m of members) {
      if (budget <= 0) break;
      try {
        const r = await this.step(ctx, m, now);
        if (r === 'sent' || r === 'failed') {
          budget--;
          if (r === 'sent') sent++;
        } else if (r === 'stopped') stopped++;
      } catch (e) {
        this.logger.error(`Campaign step failed for a member: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { sent, stopped };
  }

  /** One due member: stop if they should, pass a wait, or claim and send one message step. */
  private async step(ctx: CompanyContext, m: Member, now: Date): Promise<'sent' | 'failed' | 'stopped' | 'waited' | 'done' | 'skipped'> {
    const org = ctx.organizationId;
    const claim = await this.tenantPrisma.forTenant(ctx, async (tx) => {
      const camp = await tx.talentCampaign.findFirst({ where: { id: m.campaignId, organizationId: org } });
      const cand = await tx.candidate.findFirst({ where: { id: m.candidateId, organizationId: org } });
      const end = async (status: 'stopped' | 'done', reason: string | null) => {
        await tx.talentCampaignMember.update({ where: { id: m.id }, data: { status, stopReason: reason, endedAt: now } });
        if (status === 'stopped') await audit(tx, ctx, 'ats.campaign.member_stopped', 'talent_campaign', m.campaignId, { candidateId: m.candidateId, reason });
        return { kind: status === 'stopped' ? ('stopped' as const) : ('done' as const) };
      };
      if (!camp || camp.status !== 'running') return end('stopped', 'campaign_stopped');
      if (!cand || cand.erasedAt || cand.mergedIntoId) return end('stopped', 'erased');
      const channel = camp.channel as Channel;
      if ((channel === 'email' && cand.emailOptedOutAt) || (channel === 'whatsapp' && cand.whatsappOptedOutAt)) return end('stopped', 'opted_out');
      if (!(await poolConsented(tx, org, [cand.id])).has(cand.id)) return end('stopped', 'no_consent');
      if (channel === 'whatsapp' && !cand.whatsappOptedInAt) return end('stopped', 'no_consent');
      if (cand.globalStage === 'hired') return end('stopped', 'hired');
      if ((await minorState(tx, org, cand.id, todayIst())).minor) return end('stopped', 'no_consent');
      if (camp.stopOnApply && (await tx.pipelineEntry.findFirst({ where: { organizationId: org, candidateId: cand.id, createdAt: { gt: m.enrolledAt } }, select: { id: true } }))) return end('stopped', 'applied');
      const steps = camp.steps as unknown as Step[];
      const s = steps[m.stepIndex];
      if (!s) return end('done', null);
      if (s.kind === 'wait') {
        await tx.talentCampaignMember.update({ where: { id: m.id }, data: { stepIndex: m.stepIndex + 1, nextDueAt: new Date(now.getTime() + s.days * 86_400_000) } });
        return { kind: 'waited' as const };
      }
      // Claim the step: the unique (member, step) row means it goes out once even if two sweeps race.
      const claimed = await tx.talentCampaignSend.createMany({ data: [{ organizationId: org, campaignId: camp.id, memberId: m.id, candidateId: cand.id, stepIndex: m.stepIndex, channel, templateId: s.templateId }], skipDuplicates: true });
      await tx.talentCampaignMember.update({ where: { id: m.id }, data: { stepIndex: m.stepIndex + 1, nextDueAt: now, ...(m.stepIndex + 1 >= steps.length ? { status: 'done', endedAt: now } : {}) } });
      if (!claimed.count) return { kind: 'skipped' as const };
      const send = await tx.talentCampaignSend.findFirstOrThrow({ where: { memberId: m.id, stepIndex: m.stepIndex }, select: { id: true } });
      let unsubscribeToken = cand.unsubscribeToken;
      if (!unsubscribeToken) {
        unsubscribeToken = randomUUID();
        await tx.candidate.update({ where: { id: cand.id }, data: { unsubscribeToken } });
      }
      const tpl = channel === 'email'
        ? await tx.candidateEmailTemplate.findFirst({ where: { id: s.templateId, organizationId: org }, select: { subject: true, body: true } })
        : await tx.candidateWhatsappTemplate.findFirst({ where: { id: s.templateId, organizationId: org }, select: { body: true } });
      const company = await tx.organization.findUnique({ where: { id: org }, select: { name: true, logoPath: true } });
      return { kind: 'send' as const, sendId: send.id, channel, campName: camp.name, cand, unsubscribeToken, tpl, company, templateId: s.templateId };
    });
    if (claim.kind !== 'send') return claim.kind;

    // Outside any transaction: the provider call.
    let ok = false;
    let body = '';
    let subject = '';
    if (claim.tpl) {
      const t = claim.tpl as { subject?: string; body: string };
      const r = renderTemplate(t.subject ?? '', t.body, { candidateName: claim.cand.name, jobTitle: '', orgName: claim.company?.name ?? '', recruiterName: '', statusLink: '' });
      body = r.body;
      subject = r.subject;
      if (claim.channel === 'email') {
        const logoUrl = claim.company?.logoPath ? ((await this.blobStorage.signIfOurs(claim.company.logoPath, LOGO_SIGN_TTL_MS)) as string | null) : null;
        const html = buildCandidateEmailHtml({ logoUrl, orgName: claim.company?.name ?? null, bodyText: body, unsubscribeUrl: `${FRONTEND()}/unsubscribe/${claim.unsubscribeToken}` });
        ok = (await this.email.send({ to: claim.cand.email, subject, html, organizationId: org })).success;
      } else if (claim.cand.phone) {
        ok = (await this.whatsapp.send({ to: claim.cand.phone, body, organizationId: org })).success;
      }
    }
    await this.tenantPrisma.forTenant(ctx, async (tx) => {
      await tx.talentCampaignSend.update({ where: { id: claim.sendId }, data: { status: ok ? 'sent' : 'failed' } });
      if (claim.channel === 'email' && claim.tpl) {
        await tx.candidateEmail.create({ data: { organizationId: org, candidateId: claim.cand.id, templateId: claim.templateId, toEmail: claim.cand.email, subject, renderedBody: body, status: ok ? 'sent' : 'failed', source: 'campaign', errorDetail: ok ? null : 'delivery failed' } });
      }
      // No message text or address in the audit (the send row and the message log hold them).
      await audit(tx, ctx, ok ? 'ats.campaign.sent' : 'ats.campaign.send_failed', 'talent_campaign', m.campaignId, { candidateId: claim.cand.id, step: m.stepIndex + 1, channel: claim.channel, campaign: claim.campName });
    });
    return ok ? 'sent' : 'failed';
  }
}
