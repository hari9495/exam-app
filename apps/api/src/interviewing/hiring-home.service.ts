import { Injectable } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService, resolvePermissionGrants } from '@exam-platform/shared';
import { inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { addDays } from '../time/time-maths';
import { ApprovalsService } from '../approvals/approvals.service';
import type { RequestUser } from '../employee-history/employee-history.service';
import { ScorecardsService } from './scorecards.service';

/** An application this long in one active stage shows under Needs your action (founder decision 19 Oct 2026). */
export const WAITING_DAYS = 7;

/** The recruiter part of the Home. A section is absent when the person may not open the page it links to. */
export interface HiringHome {
  scorecardsDue?: { interviewId: string; candidate: string; job: string; endedAt: string }[];
  interviewsToday?: { interviewId: string; candidate: string; job: string; at: string }[];
  offers?: { offerId: string; entryId: string; jobId: string; candidate: string; job: string; status: string; action: 'approve' | 'send' }[];
  waiting?: { entryId: string; jobId: string; candidate: string; job: string; stage: string; since: string }[];
  week?: { applied: number; interview: number; offers: number; hired: number };
  jobs?: { id: string; title: string; stages: { name: string; count: number }[] }[];
}

const KEYS = ['interview:view_assigned', 'pipeline:manage', 'results:view'] as const;
const istStart = (isoDay: string) => new Date(`${isoDay}T00:00:00+05:30`);

// Recruiter Home (founder decision 19 Oct 2026). Each section uses the rule of the hiring page it links to:
// interviews and scorecards are the person's own as a panellist (/hiring/interviews/mine), jobs and their numbers
// are the jobs the person created or is hiring manager for (board rule: pipeline:manage or results:view), offers
// to send need pipeline:manage, and offers to approve are the person's own approval inbox. All inside RLS.
@Injectable()
export class HiringHomeService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly scorecards: ScorecardsService,
    private readonly approvals: ApprovalsService,
  ) {}

  async home(ctx: TenantContext, user: RequestUser): Promise<HiringHome | null> {
    // A YukthiX support session never sees hiring (D14).
    if (!ctx.organizationId || !user.userId || user.actingSuperAdmin) return null;
    const me = user.userId;
    const keys = await resolvePermissionGrants(this.prisma, this.tenantPrisma, { role: user.role, organizationId: user.organizationId ?? null, permissionProfileId: user.permissionProfileId, userId: me }, [...KEYS]);
    if (!keys.size) return null;
    const out: HiringHome = {};
    const now = new Date();
    const today = todayIst(now);

    const mine = await this.scorecards.mine(ctx, me);
    const live = mine.filter((i) => i.status !== 'cancelled' && i.confirmed && i.when && i.endsAt);
    out.scorecardsDue = live
      .filter((i) => i.endsAt! <= now && (i.scorecard === 'not_started' || i.scorecard === 'draft'))
      .map((i) => ({ interviewId: i.id, candidate: i.candidateName, job: i.jobTitle, endedAt: i.endsAt!.toISOString() }));
    const from = istStart(today);
    const to = istStart(addDays(today, 1));
    out.interviewsToday = live
      .filter((i) => i.when! >= from && i.when! < to)
      .sort((a, b) => a.when!.getTime() - b.when!.getTime())
      .map((i) => ({ interviewId: i.id, candidate: i.candidateName, job: i.jobTitle, at: i.when!.toISOString() }));

    const toApprove = (await this.approvals.listRequests(ctx, me, 'inbox')).filter((r) => r.gate === 'offer').map((r) => r.subjectId);
    const jobsKey = keys.has('pipeline:manage') || keys.has('results:view');
    // This week runs Monday to Sunday in IST, as on the HR Home.
    const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
    const weekStart = istStart(monday);

    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const myJobs = jobsKey
        ? await tx.job.findMany({ where: { organizationId: org, deletedAt: null, OR: [{ createdById: me }, { hiringManagerId: me }] }, orderBy: { createdAt: 'desc' }, select: { id: true, title: true, status: true, pipelineId: true } })
        : [];
      const jobIds = myJobs.map((j) => j.id);
      const open = myJobs.filter((j) => j.status === 'open');

      const offerRows = await tx.offer.findMany({
        where: {
          organizationId: org,
          OR: [
            { id: { in: toApprove }, status: 'pending_approval' },
            ...(keys.has('pipeline:manage') ? [{ status: { in: ['draft', 'approved'] }, pipelineEntry: { jobId: { in: jobIds } } }] : []),
          ],
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, status: true, pipelineEntry: { select: { id: true, jobId: true, job: { select: { title: true } }, candidate: { select: { name: true } } } } },
      });
      out.offers = offerRows.map((o) => ({ offerId: o.id, entryId: o.pipelineEntry.id, jobId: o.pipelineEntry.jobId, candidate: o.pipelineEntry.candidate.name, job: o.pipelineEntry.job.title, status: o.status, action: o.status === 'pending_approval' ? 'approve' : 'send' }));
      if (!jobsKey) return out;

      const waiting = await tx.pipelineEntry.findMany({
        where: { organizationId: org, jobId: { in: open.map((j) => j.id) }, archivedAt: null, rejected: false, stageEnteredAt: { lt: new Date(now.getTime() - WAITING_DAYS * 86_400_000) }, status: { stage: { category: 'active' } } },
        orderBy: { stageEnteredAt: 'asc' },
        take: 50,
        select: { id: true, jobId: true, stageEnteredAt: true, candidate: { select: { name: true } }, job: { select: { title: true } }, status: { select: { stage: { select: { name: true } } } } },
      });
      out.waiting = waiting.map((e) => ({ entryId: e.id, jobId: e.jobId, candidate: e.candidate.name, job: e.job.title, stage: e.status?.stage.name ?? '', since: e.stageEnteredAt.toISOString() }));

      const onMine = { organizationId: org, jobId: { in: jobIds } };
      const since = { gte: weekStart };
      out.week = {
        applied: await tx.pipelineEntry.count({ where: { ...onMine, createdAt: since } }),
        // First interview set up this week, so a second round is not counted again.
        interview: await tx.pipelineEntry.count({ where: { ...onMine, interviews: { some: { createdAt: since, status: { not: 'cancelled' } } }, NOT: { interviews: { some: { createdAt: { lt: weekStart } } } } } }),
        offers: await tx.offer.count({ where: { organizationId: org, sentAt: since, pipelineEntry: { jobId: { in: jobIds } } } }),
        hired: await tx.pipelineEntry.count({ where: { ...onMine, stageEnteredAt: since, status: { stage: { category: 'hired' } } } }),
      };

      const stages = await tx.pipelineStage.findMany({
        where: { organizationId: org, pipelineId: { in: open.map((j) => j.pipelineId).filter((id): id is string => Boolean(id)) }, category: { not: 'rejected' } },
        orderBy: { position: 'asc' },
        select: { id: true, name: true, pipelineId: true, statuses: { select: { id: true } } },
      });
      const grouped = await tx.pipelineEntry.groupBy({ by: ['jobId', 'statusId'], where: { organizationId: org, jobId: { in: open.map((j) => j.id) }, archivedAt: null }, _count: true });
      out.jobs = open.map((j) => ({
        id: j.id,
        title: j.title,
        stages: stages
          .filter((s) => s.pipelineId === j.pipelineId)
          .map((s) => ({ name: s.name, count: grouped.filter((g) => g.jobId === j.id && s.statuses.some((x) => x.id === g.statusId)).reduce((n, g) => n + g._count, 0) })),
      }));
      return out;
    });
  }
}
