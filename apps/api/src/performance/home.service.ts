import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { GOAL_SET, PerformanceGoalsService } from './goals.service';
import { PerformanceReviewsService } from './reviews.service';
import { PerformanceFeedbackService } from './feedback.service';
import type { StageIn } from './review-rules';

// PRF-01 Performance home: one read that draws the home for the viewer's role. Everything here is something the viewer
// may already read elsewhere (their own goals and reviews, their team's through the manager chain, and for HR who run
// cycles the company's cycle figures); the parts come from the same services, so the same access rules apply.
//   persona  hr: runs review cycles company-wide (perf.cycle.manage) · mgr: has direct reports today · emp: anyone else
//   numbers  counts only for HR (cycles, overdue stages, released bands by department, live PIPs, goals aligned), each
//            with last month's figure from the monthly snapshot (founder answer b, 3 Nov 2026)

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ACTIVE_PIP = ['active', 'extended'];

type Action = { id: string; type: string; title: string; who: string; due: string | null; href: string; actionLabel?: string };

/** The first day of the month of an ISO date, and of the month before. */
export const monthOf = (day: string) => `${day.slice(0, 7)}-01`;
export function monthBefore(day: string): string {
  const [y, m] = day.split('-').map(Number);
  return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
}
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

@Injectable()
export class PerformanceHomeService {
  private readonly logger = new Logger(PerformanceHomeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly goals: PerformanceGoalsService,
    private readonly reviews: PerformanceReviewsService,
    private readonly feedback: PerformanceFeedbackService,
  ) {}

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  async home(ctx: TenantContext, user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['perf.cycle.manage', 'perf.pip.manage']);
    const hr = tenantWide(v, 'perf.cycle.manage') && !v.actingForOther;
    const today = todayIst();
    const base = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = v.userId && !v.actingForOther ? await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true, givenName: true, preferredName: true } }) : null;
      const u = v.userId ? await tx.user.findFirst({ where: { id: v.userId }, select: { name: true } }) : null;
      const period = await this.openPeriod(tx, org, today);
      const reports = me
        ? await tx.$queryRaw<{ id: string; designation: string | null }[]>`
            SELECT DISTINCT ON (a.employee_id) a.employee_id::text AS id, d.name AS designation FROM employee_assignments a
            LEFT JOIN designations d ON d.organization_id = a.organization_id AND d.id = a.designation_id
            WHERE a.organization_id = ${org}::uuid AND a.manager_employee_id = ${me.id}::uuid AND a.superseded_at IS NULL
              AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date) ORDER BY a.employee_id, a.valid_from DESC`
        : [];
      return { me, name: me ? me.preferredName || me.givenName : (u?.name ?? '').split(' ')[0], period: period ? { id: period.id, name: period.name, fromOn: iso(period.fromOn), toOn: iso(period.toOn) } : null, reports };
    });
    const persona: 'hr' | 'mgr' | 'emp' = hr ? 'hr' : base.reports.length ? 'mgr' : 'emp';
    const me = base.me?.id ?? null;
    const periodId = base.period?.id ?? null;

    // The viewer's own goals and reviews, and their team's, through the same reads as the goals and reviews pages.
    const myGoals = me && periodId ? (await this.goals.list(ctx, user, periodId, 'mine')).goals : [];
    const mine = me ? await this.reviews.list(ctx, user, 'mine') : [];
    const team = me && base.reports.length ? await this.reviews.list(ctx, user, 'team') : [];
    const myReview = mine.find((r) => r.status !== 'closed') ?? null;
    const received = me ? (await this.feedback.list(ctx, user, 'received')).items.filter((x) => x.text).slice(0, 3) : [];
    const teamGoals = me && periodId && base.reports.length ? await this.teamGoals(ctx, user, periodId) : [];

    const rest = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const actions: Action[] = [];
      const cycleStages = myReview ? ((await tx.reviewCycle.findFirst({ where: { organizationId: org, id: myReview.cycleId }, select: { stages: true } }))?.stages as StageIn[] | undefined) ?? [] : [];
      if (myReview?.status === 'open' && myReview.next.stage === 'self') actions.push({ id: `self-${myReview.id}`, type: 'Review', title: `Your self review · ${myReview.cycle}`, who: base.name, due: myReview.next.dueOn, href: `/yx/performance/reviews/${myReview.id}`, actionLabel: 'Start' });
      for (const r of mine.filter((x) => x.status === 'released')) actions.push({ id: `ack-${r.id}`, type: 'Review', title: `Read and acknowledge your review · ${r.cycle}`, who: r.manager, due: null, href: `/yx/performance/reviews/${r.id}`, actionLabel: 'Open' });
      const waiting = team.filter((x) => x.status === 'open' && x.next.stage === 'manager');
      const minePending = new Set(me && waiting.length ? (await tx.review.findMany({ where: { organizationId: org, id: { in: waiting.map((x) => x.id) }, managerEmployeeId: me }, select: { id: true } })).map((r) => r.id) : []);
      for (const r of waiting.filter((x) => minePending.has(x.id))) actions.push({ id: `mgr-${r.id}`, type: 'Review', title: `Manager review · ${r.cycle}`, who: r.employee, due: r.next.dueOn, href: `/yx/performance/reviews/${r.id}`, actionLabel: 'Review' });
      // Skip-level: reviews whose manager reports to me.
      const skips = team.filter((x) => x.status === 'open' && x.next.stage === 'skip');
      const reportIds = base.reports.map((r) => r.id);
      const mySkips = new Set(skips.length && reportIds.length ? (await tx.review.findMany({ where: { organizationId: org, id: { in: skips.map((x) => x.id) }, managerEmployeeId: { in: reportIds } }, select: { id: true } })).map((r) => r.id) : []);
      for (const r of skips.filter((x) => mySkips.has(x.id))) actions.push({ id: `skip-${r.id}`, type: 'Review', title: `Skip-level review · ${r.cycle}`, who: r.employee, due: r.next.dueOn, href: `/yx/performance/reviews/${r.id}`, actionLabel: 'Review' });
      // Answer 2626: 360° reviewers a report sent for approval wait for their manager here (not only in the bell).
      const sent = me && !v.actingForOther ? await tx.review.findMany({ where: { organizationId: org, managerEmployeeId: me, status: 'open', nominationsSentAt: { not: null } }, select: { id: true, employeeId: true, cycleId: true } }) : [];
      const open = sent.length ? await tx.feedbackNomination.groupBy({ by: ['reviewId'], where: { organizationId: org, reviewId: { in: sent.map((r) => r.id) }, status: 'proposed' }, _count: { _all: true } }) : [];
      const toDecide = sent.filter((r) => open.some((o) => o.reviewId === r.id));
      if (toDecide.length) {
        const cycles = await tx.reviewCycle.findMany({ where: { organizationId: org, id: { in: toDecide.map((r) => r.cycleId) } }, select: { id: true, name: true, peerFeedback: true } });
        const who = await this.names(tx, org, toDecide.map((r) => r.employeeId));
        for (const r of toDecide) {
          const cy = cycles.find((x) => x.id === r.cycleId);
          const due = (cy?.peerFeedback as { dueOn?: string } | null)?.dueOn ?? null;
          actions.push({ id: `nom-${r.id}`, type: 'Review', title: `Approve 360° reviewers · ${cy?.name ?? ''}`, who: who.get(r.employeeId) ?? '', due, href: `/yx/performance/reviews/${r.id}/nominations`, actionLabel: 'Review' });
        }
      }
      if (v.userId && !v.actingForOther) {
        const tasks = await tx.$queryRaw<{ subject_id: string; due_at: Date | null; title: string }[]>`
          SELECT r.subject_id::text, t.due_at, r.title FROM wf_tasks t JOIN wf_requests r ON r.organization_id = t.organization_id AND r.id = t.request_id
          WHERE t.organization_id = ${org}::uuid AND t.assignee_user_id = ${v.userId}::uuid AND t.status = 'open' AND r.request_type = ${GOAL_SET} ORDER BY t.created_at LIMIT 20`;
        const names = await this.names(tx, org, tasks.map((t) => t.subject_id));
        for (const t of tasks) actions.push({ id: `goals-${t.subject_id}-${t.title}`, type: 'Goals', title: t.title, who: names.get(t.subject_id) ?? '', due: t.due_at ? iso(t.due_at) : null, href: `/yx/performance/goals?employee=${t.subject_id}`, actionLabel: 'Review' });
      }
      const asked = me ? await tx.feedbackRequest.findMany({ where: { organizationId: org, askedEmployeeId: me, status: 'open' }, orderBy: { createdAt: 'asc' }, take: 10 }) : [];
      const askedNames = await this.names(tx, org, asked.map((a) => a.aboutEmployeeId));
      for (const a of asked) actions.push({ id: `fb-${a.id}`, type: 'Feedback', title: 'Feedback asked of you', who: askedNames.get(a.aboutEmployeeId) ?? '', due: a.dueOn ? iso(a.dueOn) : null, href: '/yx/performance/feedback', actionLabel: 'Give' });

      const next = me ? await tx.oneOnOne.findFirst({ where: { organizationId: org, employeeId: me, status: 'planned', on: { gte: new Date(`${today}T00:00:00Z`) } }, orderBy: { on: 'asc' } }) : null;
      const nextOneOnOne = next ? { id: next.id, with: (await this.names(tx, org, [next.managerEmployeeId])).get(next.managerEmployeeId) ?? '', on: iso(next.on), agenda: await tx.oneOnOneAgendaItem.count({ where: { organizationId: org, oneOnOneId: next.id } }) } : null;

      // My direct reports: goal progress in the open period, where their review is, the last 1:1 held and my last feedback.
      const ids = base.reports.map((r) => r.id);
      const names = await this.names(tx, org, ids);
      const goalRows = ids.length && periodId ? await tx.goal.findMany({ where: { organizationId: org, periodId, ownerType: 'person', ownerEmployeeId: { in: ids }, status: { in: ['active', 'done'] } }, select: { ownerEmployeeId: true, progress: true, weight: true } }) : [];
      const held = ids.length ? await tx.oneOnOne.groupBy({ by: ['employeeId'], where: { organizationId: org, managerEmployeeId: me!, employeeId: { in: ids }, status: 'held' }, _max: { on: true } }) : [];
      const given = ids.length ? await tx.feedbackItem.groupBy({ by: ['toEmployeeId'], where: { organizationId: org, fromEmployeeId: me!, toEmployeeId: { in: ids }, withdrawnAt: null }, _max: { createdAt: true } }) : [];
      const teamRows = base.reports
        .map((r) => {
          const gs = goalRows.filter((g) => g.ownerEmployeeId === r.id);
          const w = gs.reduce((t, g) => t + Number(g.weight), 0);
          const review = team.find((x) => x.employeeId === r.id && x.status !== 'closed') ?? null;
          const h = held.find((x) => x.employeeId === r.id)?._max.on;
          const f = given.find((x) => x.toEmployeeId === r.id)?._max.createdAt;
          return {
            id: r.id,
            name: names.get(r.id) ?? '',
            role: r.designation ?? '',
            goalProgress: gs.length ? Math.round(w ? gs.reduce((t, g) => t + Number(g.progress) * Number(g.weight), 0) / w : gs.reduce((t, g) => t + Number(g.progress), 0) / gs.length) : null,
            reviewStage: review ? `${review.next.label}${review.next.dueOn && review.status === 'open' && today > review.next.dueOn ? ' · overdue' : ''}` : 'No review running',
            reviewId: review?.id ?? null,
            lastOneOnOne: h ? iso(h) : null,
            lastFeedback: f ? iso(f) : null,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const hrPart = hr ? await this.hrFigures(tx, org, periodId, v.grants.has('perf.pip.manage'), today) : null;
      if (hrPart) for (const d of hrPart.disagreements) actions.push({ id: `dis-${d.cycleId}`, type: 'Review', title: `${d.count === 1 ? 'A disagreement' : `${d.count} disagreements`} to answer · ${d.cycle}`, who: 'Employees', due: null, href: `/yx/performance/cycles/${d.cycleId}`, actionLabel: 'Answer' });
      return { actions, cycleStages, nextOneOnOne, team: teamRows, hr: hrPart };
    });

    return {
      persona,
      name: base.name,
      period: base.period,
      actions: rest.actions,
      myGoals,
      // The old reviews list is retired (founder 3 Nov 2026): my other reviews are linked from the home.
      earlierReviews: mine.filter((r) => r.id !== myReview?.id).slice(0, 6).map((r) => ({ id: r.id, cycle: r.cycle })),
      myReview: myReview ? { id: myReview.id, cycle: myReview.cycle, status: myReview.status, stage: myReview.next.stage, next: myReview.next, employee: myReview.employee, manager: myReview.manager, stages: rest.cycleStages } : null,
      feedback: received.map((x) => ({ id: x.id, from: x.from, text: x.text!, at: x.at, kind: x.kind })),
      nextOneOnOne: rest.nextOneOnOne,
      team: rest.team,
      teamGoals,
      hr: rest.hr ? { cycles: rest.hr.cycles, ratingDistribution: rest.hr.ratingDistribution, pipsActive: rest.hr.pipsActive, goalsAligned: rest.hr.goalsAligned, cyclesRunning: rest.hr.figures.cyclesRunning, overdueStages: rest.hr.figures.overdueStages, previous: rest.hr.previous } : null,
    };
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = list.length ? await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } }) : [];
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  /** My team's goals (the manager chain) with the company and team goals above them, for the manager's goal tree. */
  private async teamGoals(ctx: TenantContext, user: ScopeUser, periodId: string) {
    const team = (await this.goals.list(ctx, user, periodId, 'team')).goals;
    const company = (await this.goals.list(ctx, user, periodId, 'company')).goals;
    const mine = (await this.goals.list(ctx, user, periodId, 'mine')).goals;
    const all = new Map([...company, ...mine, ...team].map((g) => [g.id, g]));
    const keep = new Set<string>();
    for (const g of [...team, ...mine]) {
      for (let at: string | null = g.id, depth = 0; at && depth < 20 && !keep.has(at); depth++) {
        keep.add(at);
        at = all.get(at)?.parentGoalId ?? null;
      }
    }
    return [...all.values()].filter((g) => keep.has(g.id));
  }

  /** HR's figures: every cycle with its progress, the last released ratings by department, live PIPs and alignment. */
  private async hrFigures(tx: Tx, org: string, periodId: string | null, pips: boolean, today: string) {
    const cycles = await tx.reviewCycle.findMany({ where: { organizationId: org, status: { not: 'closed' } }, orderBy: [{ periodTo: 'desc' }, { name: 'asc' }], take: 12 });
    const rows = cycles.length ? await tx.review.findMany({ where: { organizationId: org, cycleId: { in: cycles.map((x) => x.id) }, status: { not: 'closed' } }, select: { cycleId: true, status: true, stage: true } }) : [];
    const STAGE: Record<string, string> = { self: 'Self review', manager: 'Manager review', skip: 'Skip-level review', release: 'Waiting for release', done: 'Done' };
    const out = cycles.map((x) => {
      const rs = rows.filter((r) => r.cycleId === x.id);
      const due = (k: string) => (x.stages as StageIn[]).find((s) => s.key === k)?.dueOn ?? null;
      const open = rs.filter((r) => r.status === 'open');
      // The stage most people are at decides the stage shown (the furthest-behind one on a tie).
      const at = ['self', 'manager', 'skip', 'release'].map((k) => ({ k, n: rs.filter((r) => r.stage === k).length })).sort((a, b) => b.n - a.n)[0];
      return {
        id: x.id,
        name: x.name,
        status: x.status,
        stage: x.status === 'draft' ? 'Draft, not started' : x.status === 'released' && !open.length ? 'Released' : at && at.n ? STAGE[at.k] : 'Done',
        eligible: rs.length,
        done: rs.filter((r) => r.status === 'released' || r.status === 'acknowledged').length,
        overdue: open.filter((r) => {
          const d = due(r.stage);
          return d !== null && today > d;
        }).length,
      };
    });
    const disagreements = await tx.$queryRaw<{ cycle_id: string; name: string; n: number }[]>`
      SELECT r.cycle_id::text, c.name, COUNT(*)::int AS n FROM review_disagreements d JOIN reviews r ON r.organization_id = d.organization_id AND r.id = d.review_id
      JOIN review_cycles c ON c.organization_id = r.organization_id AND c.id = r.cycle_id
      WHERE d.organization_id = ${org}::uuid AND d.status = 'open' GROUP BY r.cycle_id, c.name ORDER BY c.name`;

    // The last released cycle's bands by today's department (released and acknowledged reviews only).
    const last = await tx.reviewCycle.findFirst({ where: { organizationId: org, status: { in: ['released', 'closed'] } }, orderBy: [{ releasedAt: 'desc' }] });
    let ratingDistribution: { cycle: string; bands: string[]; rows: { dept: string; counts: number[]; size: number }[] } | null = null;
    if (last) {
      const bands = (await tx.ratingBand.findMany({ where: { organizationId: org, scaleId: last.scaleId }, orderBy: { fromScore: 'asc' } })).map((b) => b.label);
      const got = await tx.$queryRaw<{ dept: string; band: string; n: number }[]>`
        SELECT COALESCE(d.name, 'No department') AS dept, r.band, COUNT(*)::int AS n FROM reviews r
        LEFT JOIN employee_assignments a ON a.organization_id = r.organization_id AND a.employee_id = r.employee_id AND a.superseded_at IS NULL
          AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
        LEFT JOIN departments d ON d.organization_id = a.organization_id AND d.id = a.department_id
        WHERE r.organization_id = ${org}::uuid AND r.cycle_id = ${last.id}::uuid AND r.status IN ('released', 'acknowledged') AND r.band IS NOT NULL
        GROUP BY 1, 2`;
      const depts = [...new Set(got.map((g) => g.dept))].sort();
      ratingDistribution = { cycle: last.name, bands, rows: depts.map((dept) => { const counts = bands.map((b) => got.find((g) => g.dept === dept && g.band === b)?.n ?? 0); return { dept, counts, size: counts.reduce((t, n) => t + n, 0) }; }) };
    }
    const pipsAll = await tx.pip.count({ where: { organizationId: org, status: { in: ACTIVE_PIP } } });
    const pipsActive = pips ? pipsAll : null;
    let goalsAligned: number | null = null;
    if (periodId) {
      const [a] = await tx.$queryRaw<{ total: number; aligned: number }[]>(Prisma.sql`
        SELECT COUNT(*)::int AS total, COUNT(parent_goal_id)::int AS aligned FROM goals
        WHERE organization_id = ${org}::uuid AND period_id = ${periodId}::uuid AND owner_type <> 'company' AND status IN ('submitted', 'active', 'done')`);
      goalsAligned = a && a.total ? Math.round((a.aligned / a.total) * 100) : null;
    }
    // Last month's figures (the snapshot of the month before this one); PIPs only for HR who may see plans.
    const prev = await tx.perfHomeSnapshot.findFirst({ where: { organizationId: org, month: new Date(`${monthBefore(today)}T00:00:00Z`) } });
    const previous = prev ? { label: MONTH_NAMES[prev.month.getUTCMonth()], cyclesRunning: prev.cyclesRunning, overdueStages: prev.overdueStages, pipsActive: pips ? prev.pipsActive : null, goalsAligned: prev.goalsAligned } : null;
    const figures = { cyclesRunning: cycles.filter((x) => x.status === 'launched' || x.status === 'calibrating').length, overdueStages: out.reduce((t, x) => t + x.overdue, 0), pipsActive: pipsAll, goalsAligned };
    return { cycles: out, disagreements: disagreements.map((d) => ({ cycleId: d.cycle_id, cycle: d.name, count: d.n })), ratingDistribution, pipsActive, goalsAligned, previous, figures };
  }

  /** The open goal period today (the latest open one if none covers today), as the home picks it. */
  private async openPeriod(tx: Tx, org: string, today: string) {
    const on = new Date(`${today}T00:00:00Z`);
    return (await tx.goalPeriod.findFirst({ where: { organizationId: org, status: 'open', fromOn: { lte: on }, toOn: { gte: on } }, orderBy: { fromOn: 'desc' } })) ?? (await tx.goalPeriod.findFirst({ where: { organizationId: org, status: 'open' }, orderBy: { fromOn: 'desc' } }));
  }

  /**
   * Founder answer (b): the HR home's numbers for this month, written again by every daily run until the month ends, so a
   * past month's row holds its last figures. Safe to re-run (one row per company and month); BullMQ runs one job at a time.
   */
  async snapshotOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    return this.tenantPrisma.forTenant(c, async (tx) => {
      const period = await this.openPeriod(tx, org, today);
      const { figures: f } = await this.hrFigures(tx, org, period?.id ?? null, true, today);
      const month = new Date(`${monthOf(today)}T00:00:00Z`);
      const data = { cyclesRunning: f.cyclesRunning, overdueStages: f.overdueStages, pipsActive: f.pipsActive, goalsAligned: f.goalsAligned, takenAt: new Date() };
      return tx.perfHomeSnapshot.upsert({ where: { organizationId_month: { organizationId: org, month } }, create: { organizationId: org, month, ...data }, update: data });
    });
  }

  async snapshotAll(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT organization_id::text AS id FROM review_cycles UNION SELECT organization_id::text FROM pips UNION SELECT organization_id::text FROM goal_periods`);
    for (const { id } of orgs) {
      try {
        await this.snapshotOrg(id, today);
      } catch (e) {
        this.logger.warn(`home snapshot ${id}: ${(e as Error).message}`);
      }
    }
    return orgs.length;
  }
}
