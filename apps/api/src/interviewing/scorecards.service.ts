import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { Tx, audit, inCompany, type CompanyContext } from '../org-structure/org-structure.service';
import { EmailService } from '../email/email.service';
import { interviewResult, missingForSubmit, visibleScorecards, weightedScore } from './scorecard-rules';
import type { ScorecardDto } from './interviewing-dto';
import { SETTINGS } from '../org-structure/settings-registry';

export type Viewer = { userId: string; role: string; organizationId?: string | null; permissionProfileId?: string | null };

// Recruitment batch AT5 (M10-BUILD-DESIGN §8.2, §8.3, founder D7): one interview as a panellist or recruiter sees it
// — the panel, the candidate's résumé summary, the scorecard to fill, and the other scorecards under the D7 rule (a
// panellist reads colleagues' scorecards only after submitting their own; recruiters and the hiring manager read
// every submitted one). When every panellist has submitted, the result against the pass bar is shown. Missing
// scorecards are chased at 24 h and 48 h after the interview.
const commentView = (m: { id: string; authorUserId: string; body: string; createdAt: Date; redactedAt: Date | null }, author: string) => ({ id: m.id, authorUserId: m.authorUserId, author, body: m.body, at: m.createdAt, redacted: Boolean(m.redactedAt) });

@Injectable()
export class ScorecardsService {
  private readonly logger = new Logger(ScorecardsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /** Recruiters (pipeline:manage) oversee every interview; a job's hiring manager oversees that job's. */
  async isRecruiter(v: Viewer) {
    return (await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: v.role, organizationId: v.organizationId ?? null, permissionProfileId: v.permissionProfileId, userId: v.userId }, ['pipeline:manage'])).has('pipeline:manage');
  }

  async load(tx: Tx, c: CompanyContext, interviewId: string) {
    const iv = await tx.interview.findFirst({
      where: { id: interviewId, organizationId: c.organizationId },
      include: { panelists: true, slots: true, pipelineEntry: { select: { id: true, jobId: true, candidateId: true, job: { select: { title: true, hiringManagerId: true, scorecardTemplateId: true } }, candidate: { select: { name: true, email: true } } } } },
    });
    if (!iv) throw new NotFoundException('Interview not found.');
    const templateId = iv.scorecardTemplateId ?? iv.pipelineEntry.job.scorecardTemplateId;
    const template = templateId ? await tx.scorecardTemplate.findFirst({ where: { id: templateId, organizationId: c.organizationId }, include: { items: { orderBy: { position: 'asc' } } } }) : null;
    return { iv, template };
  }

  async access(iv: { panelists: { userId: string }[]; pipelineEntry: { job: { hiringManagerId: string | null } } }, v: Viewer) {
    const isPanelist = iv.panelists.some((p) => p.userId === v.userId);
    const isOverseer = iv.pipelineEntry.job.hiringManagerId === v.userId || (await this.isRecruiter(v));
    if (!isPanelist && !isOverseer) throw new ForbiddenException('You are not on this interview panel.');
    return { isPanelist, isOverseer };
  }

  get(ctx: TenantContext, interviewId: string, v: Viewer) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { iv, template } = await this.load(tx, c, interviewId);
      const who = await this.access(iv, v);
      const cards = await tx.scorecard.findMany({ where: { interviewId, organizationId: c.organizationId }, include: { ratings: true } });
      const shown = visibleScorecards(cards, { userId: v.userId, ...who });
      // Answer 322: comments under a submitted scorecard, shown to whoever may read that scorecard (never on drafts).
      const comments = await tx.scorecardComment.findMany({ where: { organizationId: c.organizationId, scorecardId: { in: shown.filter((x) => x.status === 'submitted').map((x) => x.id) } }, orderBy: { createdAt: 'asc' } });
      const users = await tx.user.findMany({ where: { id: { in: [...new Set([...iv.panelists.map((p) => p.userId), ...comments.map((x) => x.authorUserId)])] } }, select: { id: true, name: true, email: true } });
      const profile = await tx.candidateProfile.findUnique({ where: { candidateId: iv.pipelineEntry.candidateId }, select: { parsedTitle: true, parsedSummary: true, parsedSkills: true, resumePath: true, resumeScan: true } });
      // Earlier rounds for the same application, under the same rule (only what this viewer may read).
      const earlier = await tx.interview.findMany({ where: { pipelineEntryId: iv.pipelineEntryId, id: { not: interviewId }, createdAt: { lt: iv.createdAt } }, select: { id: true, createdAt: true } });
      const ownSubmitted = cards.some((x) => x.panelistUserId === v.userId && x.status === 'submitted');
      const earlierCards = earlier.length && (who.isOverseer || ownSubmitted) ? await tx.scorecard.findMany({ where: { interviewId: { in: earlier.map((e) => e.id) }, status: 'submitted' }, select: { interviewId: true, panelistUserId: true, recommendation: true, weightedScore: true, passes: true, summary: true } }) : [];
      const submitted = cards.filter((x) => x.status === 'submitted').map((x) => ({ weightedScore: Number(x.weightedScore) }));
      const name = (id: string) => users.find((u) => u.id === id)?.name ?? users.find((u) => u.id === id)?.email ?? 'A panellist';
      return {
        interview: { id: iv.id, status: iv.status, location: iv.location, timeZone: iv.timeZone, meetingUrl: iv.meetingUrl, slots: iv.slots.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, confirmed: s.id === iv.confirmedSlotId })), jobId: iv.pipelineEntry.jobId, jobTitle: iv.pipelineEntry.job.title, candidateId: iv.pipelineEntry.candidateId, candidateName: iv.pipelineEntry.candidate.name },
        panel: iv.panelists.map((p) => ({ userId: p.userId, name: name(p.userId), submitted: cards.some((x) => x.panelistUserId === p.userId && x.status === 'submitted') })),
        resume: profile ? { title: profile.parsedTitle, summary: profile.parsedSummary, skills: profile.parsedSkills, hasFile: Boolean(profile.resumePath) && profile.resumeScan === 'clean' } : null,
        template: template ? { id: template.id, name: template.name, scaleMax: template.scaleMax, passBar: Number(template.passBar), items: template.items.map((i) => ({ id: i.id, label: i.label, guidance: i.guidance, weight: i.weight })) } : null,
        viewer: { isPanelist: who.isPanelist, isOverseer: who.isOverseer },
        scorecards: shown.map((x) => ({ id: x.id, panelistUserId: x.panelistUserId, panelistName: name(x.panelistUserId), mine: x.panelistUserId === v.userId, status: x.status, recommendation: x.recommendation, summary: x.summary, weightedScore: x.weightedScore == null ? null : Number(x.weightedScore), passes: x.passes, submittedAt: x.submittedAt, ratings: x.ratings.map((r) => ({ itemId: r.itemId, rating: r.rating, notes: r.notes })), comments: comments.filter((m) => m.scorecardId === x.id).map((m) => commentView(m, name(m.authorUserId))) })),
        // The result is shown only to someone who may read every submitted scorecard.
        result: template && (who.isOverseer || cards.find((x) => x.panelistUserId === v.userId)?.status === 'submitted') ? interviewResult(iv.panelists.length, submitted, Number(template.passBar)) : null,
        earlier: earlierCards.map((x) => ({ interviewId: x.interviewId, panelistName: name(x.panelistUserId), recommendation: x.recommendation, weightedScore: Number(x.weightedScore), passes: x.passes, summary: x.summary })),
      };
    });
  }

  /**
   * Answer 322: adds a comment under a submitted scorecard. Append-only (no edit or delete; the table refuses changes),
   * audited without the text, and allowed to whoever may read that scorecard under D7. A draft never takes comments.
   * The client's requestId makes a retry or double click return the same comment.
   */
  comment(ctx: TenantContext, interviewId: string, scorecardId: string, v: Viewer, dto: { body: string; requestId?: string }) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { iv } = await this.load(tx, c, interviewId);
      const who = await this.access(iv, v);
      const cards = await tx.scorecard.findMany({ where: { interviewId, organizationId: c.organizationId }, include: { ratings: true } });
      const card = visibleScorecards(cards, { userId: v.userId, ...who }).find((x) => x.id === scorecardId);
      if (!card) throw new NotFoundException('Scorecard not found.');
      if (card.status !== 'submitted') throw new ConflictException('Comments go under a submitted scorecard. Change your draft instead.');
      if (dto.requestId) {
        const same = await tx.scorecardComment.findFirst({ where: { organizationId: c.organizationId, authorUserId: v.userId, requestId: dto.requestId } });
        if (same) {
          if (same.scorecardId !== scorecardId) throw new ConflictException('This request was already used for another comment.');
          return commentView(same, await this.userName(tx, v.userId));
        }
      }
      const row = await tx.scorecardComment.create({ data: { organizationId: c.organizationId, scorecardId, interviewId, authorUserId: v.userId, body: dto.body, requestId: dto.requestId ?? null } });
      await audit(tx, c, 'ats.scorecard.commented', 'scorecard', scorecardId, { interviewId, commentId: row.id });
      return commentView(row, await this.userName(tx, v.userId));
    });
  }

  private async userName(tx: Tx, id: string) {
    const u = await tx.user.findFirst({ where: { id }, select: { name: true, email: true } });
    return u?.name ?? u?.email ?? 'Someone';
  }

  /**
   * HIR-06 calendar: interviews whose time (the confirmed slot, else the first proposed one) falls in [from, to).
   * Recruiters see the company's; anyone else only interviews they are on or for jobs they are the hiring manager of.
   */
  range(ctx: TenantContext, v: Viewer, from: Date, to: Date) {
    if (!(to > from)) throw new BadRequestException('The end of the range must be after its start.');
    if (to.getTime() - from.getTime() > 62 * 86_400_000) throw new BadRequestException('Ask for at most 62 days at a time.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const all = await this.isRecruiter(v);
      const ivs = await tx.interview.findMany({
        where: {
          organizationId: c.organizationId,
          slots: { some: { startsAt: { gte: from, lt: to } } },
          ...(all ? {} : { OR: [{ panelists: { some: { userId: v.userId } } }, { pipelineEntry: { job: { hiringManagerId: v.userId } } }] }),
        },
        take: 500,
        include: { slots: true, panelists: { select: { userId: true } }, pipelineEntry: { select: { candidateId: true, job: { select: { title: true } }, candidate: { select: { name: true } } } } },
      });
      return ivs
        .map((i) => {
          const slot = i.slots.find((s) => s.id === i.confirmedSlotId) ?? i.slots[0];
          return { id: i.id, candidateId: i.pipelineEntry.candidateId, candidateName: i.pipelineEntry.candidate.name, jobTitle: i.pipelineEntry.job.title, startsAt: slot.startsAt, endsAt: slot.endsAt, confirmed: Boolean(i.confirmedSlotId), status: i.status, mine: i.panelists.some((p) => p.userId === v.userId) };
        })
        .filter((r) => r.startsAt >= from && r.startsAt < to)
        .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    });
  }

  /** The viewer's own interviews as a panellist, newest first, with where their scorecard stands. */
  mine(ctx: TenantContext, userId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      // HIR-06: a scorecard still missing this many hours after the interview ended shows as overdue (company setting).
      const setting = await tx.setting.findFirst({ where: { organizationId: c.organizationId, key: 'hiring.scorecard.overdue_hours', scopeType: 'tenant' }, select: { value: true } });
      const overdueMs = Number(setting?.value ?? SETTINGS['hiring.scorecard.overdue_hours'].default) * 3_600_000;
      const now = Date.now();
      const ivs = await tx.interview.findMany({
        where: { organizationId: c.organizationId, panelists: { some: { userId } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { slots: true, pipelineEntry: { select: { job: { select: { title: true, scorecardTemplateId: true } }, candidate: { select: { name: true } } } } },
      });
      const cards = await tx.scorecard.findMany({ where: { panelistUserId: userId, interviewId: { in: ivs.map((i) => i.id) } }, select: { interviewId: true, status: true } });
      return ivs.map((i) => {
        const slot = i.slots.find((s) => s.id === i.confirmedSlotId) ?? i.slots[0];
        const card = cards.find((x) => x.interviewId === i.id);
        const hasTemplate = Boolean(i.scorecardTemplateId ?? i.pipelineEntry.job.scorecardTemplateId);
        const scorecard = !hasTemplate ? 'none' : card ? card.status : 'not_started';
        const overdue = scorecard !== 'none' && scorecard !== 'submitted' && i.status !== 'cancelled' && Boolean(i.confirmedSlotId) && slot != null && slot.endsAt.getTime() + overdueMs < now;
        return { id: i.id, candidateName: i.pipelineEntry.candidate.name, jobTitle: i.pipelineEntry.job.title, when: slot?.startsAt ?? null, endsAt: slot?.endsAt ?? null, confirmed: Boolean(i.confirmedSlotId), status: i.status, scorecard, overdue };
      });
    });
  }

  /**
   * Founder answer 511: the candidate's résumé file for the interview's panel and overseers (no candidate key needed).
   * Only a file that passed the virus check; another company 404, someone off the panel 403.
   */
  resumePath(ctx: TenantContext, interviewId: string, v: Viewer) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { iv } = await this.load(tx, c, interviewId);
      await this.access(iv, v);
      const profile = await tx.candidateProfile.findFirst({ where: { organizationId: c.organizationId, candidateId: iv.pipelineEntry.candidateId }, select: { resumePath: true, resumeScan: true } });
      if (!profile?.resumePath) throw new NotFoundException('No résumé on file.');
      if (profile.resumeScan !== 'clean') throw new ConflictException(profile.resumeScan === 'infected' ? 'This résumé was blocked by the virus check.' : 'This résumé is waiting for the virus check.');
      await audit(tx, c, 'ats.interview.resume_opened', 'interview', interviewId, {});
      return profile.resumePath;
    });
  }

  /** Saves the viewer's own draft; with submit, checks it is complete, scores it and makes it final. */
  save(ctx: TenantContext, interviewId: string, v: Viewer, dto: ScorecardDto, submit: boolean) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const { iv, template } = await this.load(tx, c, interviewId);
      if (!iv.panelists.some((p) => p.userId === v.userId)) throw new ForbiddenException('Only the panel fills scorecards for this interview.');
      if (!template) throw new ConflictException('No scorecard is set for this interview. Ask the recruiter to pick one.');
      if (iv.status === 'cancelled') throw new ConflictException('This interview was cancelled.');
      const itemIds = new Set(template.items.map((i) => i.id));
      if (dto.ratings.some((r) => !itemIds.has(r.itemId))) throw new BadRequestException('A rating is for an item not on this scorecard.');
      if (dto.ratings.some((r) => r.rating != null && (r.rating < 1 || r.rating > template.scaleMax))) throw new BadRequestException(`Ratings are 1 to ${template.scaleMax}.`);
      const existing = await tx.scorecard.findUnique({ where: { interviewId_panelistUserId: { interviewId, panelistUserId: v.userId } } });
      if (existing?.status === 'submitted') throw new ConflictException('You already submitted this scorecard; it cannot change.');
      const card = existing ?? (await tx.scorecard.create({ data: { organizationId: c.organizationId, interviewId, panelistUserId: v.userId, templateId: template.id } }));
      for (const r of dto.ratings) {
        await tx.scorecardRating.upsert({
          where: { scorecardId_itemId: { scorecardId: card.id, itemId: r.itemId } },
          create: { organizationId: c.organizationId, scorecardId: card.id, itemId: r.itemId, rating: r.rating ?? null, notes: r.notes || null },
          update: { rating: r.rating ?? null, notes: r.notes || null },
        });
      }
      const ratings = await tx.scorecardRating.findMany({ where: { scorecardId: card.id } });
      if (!submit) {
        await tx.scorecard.update({ where: { id: card.id }, data: { recommendation: dto.recommendation ?? null, summary: dto.summary || null } });
        return { id: card.id, status: 'draft' };
      }
      const missing = missingForSubmit(template.items, ratings, dto.recommendation, template.scaleMax);
      if (missing.length) throw new BadRequestException(missing.join(' '));
      const score = weightedScore(template.items, ratings)!;
      await tx.scorecard.update({ where: { id: card.id }, data: { status: 'submitted', recommendation: dto.recommendation!, summary: dto.summary || null, weightedScore: score, passes: score >= Number(template.passBar), submittedAt: new Date() } });
      // HIR-25: an AI draft is a suggestion until this submit; it goes once the panellist has submitted their own scorecard.
      const fromDraft = (await tx.interviewScorecardDraft.deleteMany({ where: { organizationId: c.organizationId, interviewId, panelistUserId: v.userId } })).count > 0;
      await audit(tx, c, 'ats.scorecard.submitted', 'interview', interviewId, { score, passes: score >= Number(template.passBar), fromDraft });
      return { id: card.id, status: 'submitted', weightedScore: score, passes: score >= Number(template.passBar) };
    });
  }

  /** For the board: each application's latest interview with a scorecard — how many are in, and the result. */
  async entryResults(tx: Tx, organizationId: string, entryIds: string[]) {
    if (!entryIds.length) return new Map<string, ReturnType<typeof interviewResult> & { interviewId: string }>();
    const ivs = await tx.interview.findMany({ where: { organizationId, pipelineEntryId: { in: entryIds }, status: { not: 'cancelled' } }, orderBy: { createdAt: 'desc' }, include: { panelists: { select: { userId: true } }, pipelineEntry: { select: { job: { select: { scorecardTemplateId: true } } } } } });
    const latest = new Map<string, (typeof ivs)[number]>();
    for (const iv of ivs) if (!latest.has(iv.pipelineEntryId) && (iv.scorecardTemplateId ?? iv.pipelineEntry.job.scorecardTemplateId)) latest.set(iv.pipelineEntryId, iv);
    const ids = [...latest.values()].map((i) => i.id);
    const cards = await tx.scorecard.findMany({ where: { interviewId: { in: ids }, status: 'submitted' }, select: { interviewId: true, weightedScore: true } });
    const templates = await tx.scorecardTemplate.findMany({ where: { id: { in: [...latest.values()].map((i) => (i.scorecardTemplateId ?? i.pipelineEntry.job.scorecardTemplateId) as string) } }, select: { id: true, passBar: true } });
    const out = new Map<string, ReturnType<typeof interviewResult> & { interviewId: string }>();
    for (const [entryId, iv] of latest) {
      const bar = Number(templates.find((t) => t.id === (iv.scorecardTemplateId ?? iv.pipelineEntry.job.scorecardTemplateId))?.passBar ?? 0);
      out.set(entryId, { interviewId: iv.id, ...interviewResult(iv.panelists.length, cards.filter((x) => x.interviewId === iv.id).map((x) => ({ weightedScore: Number(x.weightedScore) })), bar) });
    }
    return out;
  }

  /** Hourly: panellists without a submitted scorecard are reminded 24 h and again 48 h after the interview. */
  async remind(now = new Date()): Promise<number> {
    const due = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.$queryRaw<{ panelist_id: string; org: string; interview_id: string; user_id: string; which: '24' | '48' }[]>`
      SELECT p.id::text AS panelist_id, p.organization_id::text AS org, p.interview_id::text AS interview_id, p.user_id::text AS user_id,
             CASE WHEN s.ends_at <= ${now}::timestamptz - interval '48 hours' AND p.reminded_48h_at IS NULL THEN '48' ELSE '24' END AS which
      FROM interview_panelists p
      JOIN interviews i ON i.id = p.interview_id
      JOIN interview_slots s ON s.id = i.confirmed_slot_id
      JOIN pipeline_entries pe ON pe.id = i.pipeline_entry_id
      JOIN jobs j ON j.id = pe.job_id
      WHERE i.status <> 'cancelled' AND COALESCE(i.scorecard_template_id, j.scorecard_template_id) IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM scorecards sc WHERE sc.interview_id = i.id AND sc.panelist_user_id = p.user_id AND sc.status = 'submitted')
        AND ((s.ends_at <= ${now}::timestamptz - interval '24 hours' AND p.reminded_24h_at IS NULL)
          OR (s.ends_at <= ${now}::timestamptz - interval '48 hours' AND p.reminded_48h_at IS NULL))
      LIMIT 500`);
    let sent = 0;
    for (const d of due) {
      try {
        const ctx = { organizationId: d.org, isSuperAdmin: false };
        // Claim first so two sweeps never send the same reminder.
        const claimed = await this.tenantPrisma.forTenant(ctx, (tx) =>
          tx.interviewPanelist.updateMany({ where: { id: d.panelist_id, ...(d.which === '48' ? { reminded48hAt: null } : { reminded24hAt: null }) }, data: d.which === '48' ? { reminded48hAt: now, reminded24hAt: now } : { reminded24hAt: now } }),
        );
        if (!claimed.count) continue;
        const info = await this.tenantPrisma.forTenant(ctx, async (tx) => ({
          user: await tx.user.findUnique({ where: { id: d.user_id }, select: { email: true, name: true } }),
          iv: await tx.interview.findUnique({ where: { id: d.interview_id }, select: { pipelineEntry: { select: { job: { select: { title: true } }, candidate: { select: { name: true } } } } } }),
        }));
        if (!info.user?.email || !info.iv) continue;
        const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/yx/hiring/interviews/${d.interview_id}`;
        const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
        const what = `${info.iv.pipelineEntry.candidate.name} for ${info.iv.pipelineEntry.job.title}`;
        await this.email.send({
          to: info.user.email,
          organizationId: d.org,
          subject: `${d.which === '48' ? 'Second reminder: ' : ''}your scorecard for ${what}`,
          html: `<p>Your scorecard for the interview with ${esc(what)} is not in yet. The recruiter is waiting for it.</p><p><a href="${link}">Fill in the scorecard</a></p>`,
          text: `Your scorecard for the interview with ${what} is not in yet.\n${link}`,
        });
        sent++;
      } catch (e) {
        this.logger.error(`Scorecard reminder failed for ${d.panelist_id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return sent;
  }
}
