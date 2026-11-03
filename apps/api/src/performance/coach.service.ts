import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AiApiKeyResolverService, AiNotConfiguredError, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer } from '../access/scope';
import { AiInvocationService } from '../ai/ai-invocation.service';
import { COACH_LOOKS_AT, coachNudges, coachWeekOf, spreadFlags, suggestedAgenda, wordingFlags, type CoachSignals } from './b3-rules';
import { ReviewDraftClient, withoutNames } from './review-draft.client';
import type { BiasCheckDto, BiasDecisionDto } from './b3-dto';

// PRF-16 manager coach and suggested 1:1 agenda; PRF-17 review assistant and bias check.
//   coach     the manager's direct reports only, from data the manager already sees (their own feedback, their 1:1s,
//             the person's goal check-ins) and, read-only from Time and People, counts only: the earned leave balance,
//             weeks with overtime and open onboarding tasks; never health, leave reasons or types of leave taken, POSH
//             or disciplinary data. The company sets how
//             often (perf.coach.frequency, default weekly; off turns it off); each manager may turn it off for themself
//             (HR does not see the choice) and dismiss a nudge for the week. Wording is fixed rule text: no AI call.
//   agenda    for the manager of a 1:1: goals off track or at risk, open actions from earlier 1:1s, recent praise.
//             Nothing is added until the manager chooses (the agenda route of PRF-11 adds it).
//   assistant for the current manager of an open review. "Help me draft" goes through AiInvocationService (provider,
//             credit quota, spend record) only when the company turned on perf.ai.review_assistant (default off) and an
//             AI provider is set; names never go to the model. The bias check is explainable rules (wording, rating
//             and text, rating spread against the company this cycle) and never changes the review; the manager's
//             Accept or Ignore on each flag is audited.

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const days = (from: Date, today: string) => Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${iso(from)}T00:00:00Z`).getTime()) / DAY);
const num = (x: { toString(): string } | null) => (x === null ? null : Number(x.toString()));

@Injectable()
export class PerformanceCoachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInvocationService,
    private readonly aiKeys: AiApiKeyResolverService,
    private readonly drafts: ReviewDraftClient,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, []);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private async me(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true, givenName: true, preferredName: true } })) ?? null;
  }

  private async names(tx: Tx, org: string, ids: string[]) {
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(ids)] } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  /** Active goals of these people whose latest check-in is off track or at risk. */
  private async goalsOff(tx: Tx, org: string, employeeIds: string[]) {
    if (!employeeIds.length) return [];
    return tx.$queryRaw<{ id: string; title: string; owner: string; confidence: 'off_track' | 'at_risk'; since: Date }[]>`
      SELECT g.id::text, g.title, g.owner_employee_id::text AS owner, c.confidence, c.on AS since FROM goals g
      JOIN LATERAL (SELECT k.confidence, k.on FROM goal_checkins k WHERE k.organization_id = g.organization_id AND k.goal_id = g.id ORDER BY k.on DESC, k.created_at DESC LIMIT 1) c ON TRUE
      WHERE g.organization_id = ${org}::uuid AND g.owner_type = 'person' AND g.status = 'active' AND g.owner_employee_id = ANY(${employeeIds}::uuid[])
        AND c.confidence IN ('off_track', 'at_risk') ORDER BY (c.confidence = 'off_track') DESC, g.weight DESC`;
  }

  /**
   * PRF-16 signals from Time and People, read-only and counts only: the earned leave balance (the ledger's sum, never a
   * reason or the kind of leave taken), how many of the last 3 weeks (ending yesterday) had overtime claimed or approved,
   * and the open tasks of an active onboarding checklist.
   */
  private async timeAndPeople(tx: Tx, org: string, ids: string[], today: string) {
    const leave = await tx.$queryRaw<{ e: string; days: number }[]>`
      SELECT l.employee_id::text AS e, SUM(l.days)::float8 AS days FROM leave_ledger l JOIN leave_types t ON t.organization_id = l.organization_id AND t.id = l.leave_type_id
      WHERE l.organization_id = ${org}::uuid AND t.kind = 'earned' AND l.employee_id = ANY(${ids}::uuid[]) AND l.entry_on <= ${today}::date GROUP BY l.employee_id`;
    const overtime = await tx.$queryRaw<{ e: string; weeks: number }[]>`
      SELECT employee_id::text AS e, COUNT(DISTINCT ((${today}::date - 1 - work_on) / 7))::int AS weeks FROM overtime_requests
      WHERE organization_id = ${org}::uuid AND employee_id = ANY(${ids}::uuid[]) AND status IN ('pending', 'approved') AND worked_minutes > 0
        AND work_on BETWEEN ${today}::date - 21 AND ${today}::date - 1 GROUP BY employee_id`;
    const onboarding = await tx.$queryRaw<{ e: string; n: number }[]>`
      SELECT e.id::text AS e, COUNT(t.id)::int AS n FROM employees e
      JOIN journeys j ON j.organization_id = e.organization_id AND j.person_id = e.person_id AND j.kind = 'onboarding' AND j.status = 'active'
      JOIN journey_tasks t ON t.organization_id = j.organization_id AND t.journey_id = j.id AND t.status IN ('open', 'waiting')
      WHERE e.organization_id = ${org}::uuid AND e.id = ANY(${ids}::uuid[]) GROUP BY e.id`;
    return { leave: new Map(leave.map((r) => [r.e, r.days])), overtime: new Map(overtime.map((r) => [r.e, r.weeks])), onboarding: new Map(onboarding.map((r) => [r.e, r.n])) };
  }

  // ------------------------------------------------------------------------------------------ PRF-16 coach card

  async coach(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const today = todayIst();
      const frequency = (await settingFor(tx, c, 'perf.coach.frequency', { legalEntityId: '' })) as 'weekly' | 'fortnightly' | 'off';
      const me = await this.me(tx, org, v);
      const base = { weekOf: coachWeekOf(today, frequency === 'off' ? 'weekly' : frequency), looksAt: COACH_LOOKS_AT, firstName: me ? me.preferredName || me.givenName : null };
      if (!me) return { ...base, state: 'not-manager' as const, optedOut: false, nudges: [] };
      const team = await tx.$queryRaw<{ id: string }[]>`
        SELECT a.employee_id::text AS id FROM employee_assignments a JOIN employments m ON m.organization_id = a.organization_id AND m.employee_id = a.employee_id
        WHERE a.organization_id = ${org}::uuid AND a.manager_employee_id = ${me.id}::uuid AND a.superseded_at IS NULL AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
          AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date) GROUP BY a.employee_id`;
      if (!team.length) return { ...base, state: 'not-manager' as const, optedOut: false, nudges: [] };
      if (frequency === 'off') return { ...base, state: 'company-off' as const, optedOut: false, nudges: [] };
      const pref = await tx.perfCoachPref.findFirst({ where: { organizationId: org, userId: v.userId! } });
      if (pref?.optedOut) return { ...base, state: 'ready' as const, optedOut: true, nudges: [] };
      const ids = team.map((t) => t.id);
      const fb = new Map((await tx.$queryRaw<{ to: string; at: Date }[]>`SELECT to_employee_id::text AS to, max(created_at) AS at FROM feedback_items WHERE organization_id = ${org}::uuid AND from_employee_id = ${me.id}::uuid AND withdrawn_at IS NULL AND to_employee_id = ANY(${ids}::uuid[]) GROUP BY to_employee_id`).map((r) => [r.to, r.at]));
      const held = new Map((await tx.$queryRaw<{ e: string; on: Date }[]>`SELECT employee_id::text AS e, max("on") AS on FROM one_on_ones WHERE organization_id = ${org}::uuid AND manager_employee_id = ${me.id}::uuid AND status = 'held' AND employee_id = ANY(${ids}::uuid[]) GROUP BY employee_id`).map((r) => [r.e, r.on]));
      const late = new Map((await tx.$queryRaw<{ e: string; on: Date }[]>`SELECT employee_id::text AS e, min("on") AS on FROM one_on_ones WHERE organization_id = ${org}::uuid AND manager_employee_id = ${me.id}::uuid AND status = 'planned' AND "on" < ${today}::date AND employee_id = ANY(${ids}::uuid[]) GROUP BY employee_id`).map((r) => [r.e, r.on]));
      const goals = await this.goalsOff(tx, org, ids);
      const people = await this.names(tx, org, ids);
      const extra = await this.timeAndPeople(tx, org, ids, today);
      const signals: CoachSignals[] = ids.map((id) => ({
        employeeId: id,
        name: people.get(id) ?? '',
        feedbackDays: fb.has(id) ? days(fb.get(id)!, today) : null,
        lastOneOnOneDays: held.has(id) ? days(held.get(id)!, today) : null,
        plannedOverdueDays: late.has(id) ? days(late.get(id)!, today) : 0,
        goalsOff: goals.filter((g) => g.owner === id).map((g) => ({ id: g.id, title: g.title, confidence: g.confidence })),
        leaveBalance: extra.leave.get(id) ?? null,
        overtimeWeeks: extra.overtime.get(id) ?? 0,
        onboardingOpen: extra.onboarding.get(id) ?? 0,
      }));
      const dismissed = new Set((await tx.perfCoachDismissal.findMany({ where: { organizationId: org, userId: v.userId!, weekOf: new Date(`${base.weekOf}T00:00:00Z`) }, select: { nudgeKey: true } })).map((d) => d.nudgeKey));
      const nudges = coachNudges(signals).filter((n) => !dismissed.has(n.key)).sort((a, b) => a.person.localeCompare(b.person));
      return { ...base, state: 'ready' as const, optedOut: false, nudges: nudges.map((n) => ({ id: n.key, person: n.person, signal: n.signal, action: n.action, link: n.link })) };
    });
  }

  /** The manager's own choice; HR does not see it (no audit metadata beyond the change itself). */
  async optOut(ctx: TenantContext, user: ScopeUser, optedOut: boolean) {
    const v = await this.viewer(user);
    if (!v.userId || v.actingForOther) throw new NotFoundException('Sign in as yourself to change coach nudges.');
    await this.run(ctx, async (tx, c) => {
      await tx.perfCoachPref.upsert({ where: { organizationId_userId: { organizationId: c.organizationId, userId: v.userId! } }, create: { organizationId: c.organizationId, userId: v.userId!, optedOut }, update: { optedOut } });
      await audit(tx, c, optedOut ? 'perf.coach.opted_out' : 'perf.coach.opted_in', 'user', v.userId!, {});
    });
    return this.coach(ctx, user);
  }

  async dismiss(ctx: TenantContext, user: ScopeUser, key: string) {
    const v = await this.viewer(user);
    if (!v.userId || v.actingForOther) throw new NotFoundException('Sign in as yourself to dismiss a nudge.');
    await this.run(ctx, async (tx, c) => {
      const frequency = (await settingFor(tx, c, 'perf.coach.frequency', { legalEntityId: '' })) as 'weekly' | 'fortnightly' | 'off';
      const weekOf = coachWeekOf(todayIst(), frequency === 'off' ? 'weekly' : frequency);
      await tx.perfCoachDismissal.createMany({ data: [{ organizationId: c.organizationId, userId: v.userId!, nudgeKey: key, weekOf: new Date(`${weekOf}T00:00:00Z`) }], skipDuplicates: true });
    });
    return this.coach(ctx, user);
  }

  // ------------------------------------------------------------------------------------------ PRF-16 suggested agenda

  async agenda(ctx: TenantContext, user: ScopeUser, oneOnOneId: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      const o = await tx.oneOnOne.findFirst({ where: { organizationId: org, id: oneOnOneId } });
      if (!o || !me || o.managerEmployeeId !== me.id) throw new NotFoundException('No such 1:1.');
      const pair = await tx.oneOnOne.findMany({ where: { organizationId: org, employeeId: o.employeeId, managerEmployeeId: me.id, id: { not: o.id } }, select: { id: true } });
      const openActions = await tx.oneOnOneAction.findMany({ where: { organizationId: org, oneOnOneId: { in: pair.map((p) => p.id) }, doneAt: null }, orderBy: { dueOn: 'asc' }, take: 5 });
      const praiseCount = await tx.feedbackItem.count({ where: { organizationId: org, toEmployeeId: o.employeeId, kind: 'praise', visibility: 'private', withdrawnAt: null, sealedAt: null, createdAt: { gte: new Date(Date.now() - 30 * DAY) } } });
      const goals = (await this.goalsOff(tx, org, [o.employeeId])).map((g) => ({ id: g.id, title: g.title, confidence: g.confidence, since: iso(g.since) }));
      const already = new Set((await tx.oneOnOneAgendaItem.findMany({ where: { organizationId: org, oneOnOneId }, select: { text: true } })).map((a) => a.text.toLowerCase()));
      return suggestedAgenda({ goalsOff: goals, openActions: openActions.map((a) => ({ id: a.id, text: a.text, dueOn: a.dueOn ? iso(a.dueOn) : null })), praiseCount }).filter((s) => !already.has(s.text.toLowerCase()));
    });
  }

  // ------------------------------------------------------------------------------------------ PRF-17 review assistant

  /** The review, if I am its current manager. Anyone else gets "not found". */
  private async managed(tx: Tx, c: CompanyContext, v: Viewer, reviewId: string) {
    const me = await this.me(tx, c.organizationId, v);
    const r = await tx.review.findFirst({ where: { organizationId: c.organizationId, id: reviewId } });
    if (!r || !me || r.managerEmployeeId !== me.id) throw new NotFoundException('No such review.');
    return r;
  }

  private async aiConfigured(org: string) {
    try {
      await this.aiKeys.resolve(org);
      return true;
    } catch (e) {
      if (e instanceof AiNotConfiguredError) return false;
      throw e;
    }
  }

  async assistant(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    const on = await this.run(ctx, async (tx, c) => {
      const r = await this.managed(tx, c, v, reviewId);
      return (await settingFor(tx, c, 'perf.ai.review_assistant', { legalEntityId: r.legalEntityId })) === 'on';
    });
    const configured = on ? await this.aiConfigured(ctx.organizationId!) : false;
    return { enabled: on && configured, reason: !on ? 'company-off' : !configured ? 'not-configured' : null };
  }

  async draft(ctx: TenantContext, user: ScopeUser, reviewId: string) {
    const v = await this.viewer(user);
    const input = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await this.managed(tx, c, v, reviewId);
      if (r.status !== 'open') throw new ConflictException('This review is finished. Drafting help is for an open review.');
      if ((await settingFor(tx, c, 'perf.ai.review_assistant', { legalEntityId: r.legalEntityId })) !== 'on') throw new ConflictException('AI review summaries are off for your company. Ask your HR admin to turn them on.');
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId } });
      const from = cycle.periodFrom;
      const to = cycle.periodTo;
      const person = await tx.employee.findFirstOrThrow({ where: { organizationId: org, id: r.employeeId }, select: { givenName: true, familyName: true, preferredName: true } });
      const hide = [person.givenName, person.familyName, person.preferredName].filter((x): x is string => Boolean(x));
      const goals = await tx.$queryRaw<{ title: string; weight: number; progress: number; confidence: string | null }[]>`
        SELECT g.title, g.weight::float8 AS weight, g.progress::float8 AS progress,
          (SELECT k.confidence FROM goal_checkins k WHERE k.organization_id = g.organization_id AND k.goal_id = g.id ORDER BY k.on DESC LIMIT 1) AS confidence
        FROM goals g JOIN goal_periods p ON p.organization_id = g.organization_id AND p.id = g.period_id
        WHERE g.organization_id = ${org}::uuid AND g.owner_type = 'person' AND g.owner_employee_id = ${r.employeeId}::uuid AND g.status IN ('active', 'done')
          AND p.from_on <= ${to} AND p.to_on >= ${from} ORDER BY g.weight DESC LIMIT 15`;
      // Only feedback the manager may already read ("private": the person and their manager chain), never sealed.
      const feedback = await tx.feedbackItem.findMany({ where: { organizationId: org, toEmployeeId: r.employeeId, visibility: 'private', withdrawnAt: null, sealedAt: null, createdAt: { gte: from, lte: new Date(to.getTime() + DAY) } }, orderBy: { createdAt: 'desc' }, take: 15, select: { kind: true, text: true } });
      const notes = await tx.oneOnOne.findMany({ where: { organizationId: org, employeeId: r.employeeId, managerEmployeeId: r.managerEmployeeId, on: { gte: from, lte: to }, sharedNotes: { not: null } }, orderBy: { on: 'desc' }, take: 5, select: { sharedNotes: true } });
      await audit(tx, c, 'perf.review.draft_requested', 'review', reviewId, { goals: goals.length, feedback: feedback.length, notes: notes.length });
      return {
        periodFrom: iso(from),
        periodTo: iso(to),
        goals: goals.map((g) => ({ ...g, title: withoutNames(g.title, hide) })),
        feedback: feedback.map((f) => ({ kind: f.kind, text: withoutNames(f.text, hide).slice(0, 600) })),
        sharedNotes: notes.map((n) => withoutNames(n.sharedNotes ?? '', hide).slice(0, 1000)),
      };
    });
    const out = await this.ai.run(ctx, { source: 'perf_review_draft', sourceId: reviewId }, (p) => this.drafts.generate(input, p));
    return { draft: out.draft, basis: `Draft from goals, feedback received and 1:1 notes, ${input.periodFrom} to ${input.periodTo}` };
  }

  /** Explainable rules only; the review is never changed. */
  async check(ctx: TenantContext, user: ScopeUser, reviewId: string, dto: BiasCheckDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await this.managed(tx, c, v, reviewId);
      const levels = await tx.ratingScaleLevel.findMany({ where: { organizationId: org, scaleId: (await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId }, select: { scaleId: true } })).scaleId }, select: { value: true } });
      const max = levels.length ? Math.max(...levels.map((l) => Number(l.value.toString()))) : 5;
      const scores = await tx.review.findMany({ where: { organizationId: org, cycleId: r.cycleId, finalScore: { not: null } }, select: { managerEmployeeId: true, finalScore: true } });
      const mine = scores.filter((s) => s.managerEmployeeId === r.managerEmployeeId).map((s) => num(s.finalScore)!);
      const flags = [...wordingFlags(dto.text, dto.rating ?? null, max), ...spreadFlags(mine, scores.map((s) => num(s.finalScore)!))];
      await audit(tx, c, 'perf.review.bias_checked', 'review', reviewId, { flags: flags.map((f) => f.kind) });
      return flags;
    });
  }

  async decideFlag(ctx: TenantContext, user: ScopeUser, reviewId: string, dto: BiasDecisionDto) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      await this.managed(tx, c, v, reviewId);
      await audit(tx, c, 'perf.review.bias_flag', 'review', reviewId, { flagId: dto.flagId, kind: dto.kind, decision: dto.decision });
      return { flagId: dto.flagId, decision: dto.decision };
    });
  }
}
