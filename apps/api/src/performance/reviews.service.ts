import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import { ScopeUser, Viewer, buildViewer, covers, grantPeriods, implicitPeriods, implicitSql, inScopeSql, started, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { RuleError, evaluate, parseGroup, type Group } from '../rules-engine/conditions';
import { APPLIES_FIELDS } from '../expenses/setup.service';
import { bandFor, bandsProblem, templateProblem, type SectionIn } from './perf-rules';
import { DEFAULT_RULES, STAGE_ORDER, eligibilityFor, scoreReview, stagesProblem, type EligibilityRules, type StageIn, type StageKey } from './review-rules';
import { holdersOf } from '../time/time-core';
import type { CycleDto, DecideDisagreementDto, EntryDto, OverrideDto } from './review-dto';

// Performance batch PM4 (M06-BUILD-DESIGN §9; PM-4.01 … 4.04): review cycles and the reviews in them.
//   cycles     HR with perf.cycle.manage (company-wide) set the period, an active template version (its scale comes
//              with it and is frozen, Q3), who is in (a P19 condition over the job record), stages with deadlines and
//              the J11 rules; the pre-flight check lists every problem; launch makes the eligibility and review rows
//   reviews    one per person per cycle; the employee answers self, the current manager answers manager; nothing of
//              the manager's is shown to the employee before release (YX-PERF-09); with the company setting
//              after_manager_draft, the manager reads the self review only after saving a first draft of their own
//   who sees   the person (their own self review and the stage they are at); the manager; the manager chain above
//              (read-only); perf.review.view in scope (read-only)
//   scoring    on the manager's submit: weighted section averages, a section with no ratings is named and left out,
//              never scored 0 (YX-PERF-02); or the manager's overall rating
//   skip       the manager's manager agrees (with a comment) or sends it back with a reason; never changes the rating
//   release    HR releases the ready reviews; only then the employee sees the rating, band and manager's review
//              (YX-PERF-09); they acknowledge (the rating stays) or disagree within perf.disagreement.days; HR answers;
//              a changed rating goes through a reopen with a reason (audited)
//   hand-over  when a manager changes, the open review moves to the new manager, logged in perf_owner_transfers (D7);
//              the old manager's draft stays theirs and hidden; goals aligned to the old manager's goal are flagged;
//              open 1:1 action items move to the next 1:1 with the new manager; HR may add the old manager (still
//              employed) as a named "other" reviewer, whose input is advisory and never scored

const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (x: Prisma.Decimal | null) => (x === null ? null : Number(x.toString()));
const addDays = (d: string, n: number) => iso(new Date(asDate(d).getTime() + n * 86_400_000));
const asJson = (x: unknown) => x as Prisma.InputJsonValue;
const CHUNK = 500;
const STAGE_LABEL: Record<string, string> = { self: 'Self review', manager: 'Manager review', skip: 'Skip-level review', release: 'Waiting for release', done: 'Done' };

type Cycle = Prisma.ReviewCycleGetPayload<object>;
type Review = Prisma.ReviewGetPayload<object>;
type Problem = { text: string; fix: string | null };

@Injectable()
export class PerformanceReviewsService {
  private readonly logger = new Logger(PerformanceReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, ['perf.cycle.manage', 'perf.review.view']);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  /** shortcut: cycles are company-wide, so managing them needs the company-wide grant; per-entity cycles come with entity populations. */
  private manager(v: Viewer) {
    if (!tenantWide(v, 'perf.cycle.manage') || v.actingForOther) throw new ForbiddenException('Review cycles are run by HR with company-wide access.');
  }

  private async me(tx: Tx, org: string, v: Viewer) {
    if (!v.userId || v.actingForOther) return null;
    return (await tx.employee.findFirst({ where: { organizationId: org, userId: v.userId }, select: { id: true } }))?.id ?? null;
  }

  private async names(tx: Tx, org: string, ids: (string | null)[]) {
    const list = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    const rows = await tx.employee.findMany({ where: { organizationId: org, id: { in: list } }, select: { id: true, givenName: true, familyName: true, preferredName: true } });
    return new Map(rows.map((e) => [e.id, [e.preferredName || e.givenName, e.familyName].filter(Boolean).join(' ')]));
  }

  private async tell(org: string, users: (string | null)[], type: string, text: string, link: string) {
    const to = [...new Set(users.filter((u): u is string => Boolean(u)))];
    if (to.length) await this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: 'performance', entityId: org, contextText: text, linkPath: link }, { subject: text, html: `<p>${text}. Open YukthiX to see it.</p>` }).catch(() => undefined);
  }

  private parsePopulation(input: Record<string, unknown> | null | undefined): Group | null {
    if (!input) return null;
    try {
      const g = parseGroup(input, APPLIES_FIELDS);
      return g.items.length ? g : null;
    } catch (e) {
      throw new BadRequestException(`Who is in: ${e instanceof RuleError ? e.message : 'not a valid condition.'}`);
    }
  }

  // ------------------------------------------------------------------------------------------ cycles (PM-4.01)

  private cycleView(x: Cycle) {
    return {
      id: x.id,
      name: x.name,
      kind: x.kind,
      periodFrom: iso(x.periodFrom),
      periodTo: iso(x.periodTo),
      templateId: x.templateId,
      scaleId: x.scaleId,
      population: x.population,
      stages: x.stages as StageIn[],
      eligibilityRules: x.eligibilityRules as EligibilityRules,
      peerFeedback: x.peerFeedback ?? null,
      status: x.status,
      launchedAt: x.launchedAt?.toISOString() ?? null,
      version: x.version,
    };
  }

  async cycles(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => (await tx.reviewCycle.findMany({ where: { organizationId: c.organizationId }, orderBy: [{ periodTo: 'desc' }, { name: 'asc' }] })).map((x) => this.cycleView(x)));
  }

  /** Active template versions to start a cycle from. */
  async templateChoices(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => (await tx.reviewTemplate.findMany({ where: { organizationId: c.organizationId, status: 'active' }, orderBy: { name: 'asc' } })).map((t) => ({ id: t.id, name: t.name, kind: t.kind, templateVersion: t.templateVersion })));
  }

  async cycle(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => {
      const x = await tx.reviewCycle.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x) throw new NotFoundException('No such cycle.');
      return this.cycleView(x);
    });
  }

  async saveCycle(ctx: TenantContext, user: ScopeUser, id: string | null, dto: CycleDto) {
    const v = await this.viewer(user);
    this.manager(v);
    if (dto.periodTo <= dto.periodFrom) throw new BadRequestException('The period ends after it starts.');
    const population = this.parsePopulation(dto.population);
    const problem = stagesProblem(dto.stages, todayIst());
    if (problem) throw new BadRequestException(problem);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const t = await tx.reviewTemplate.findFirst({ where: { organizationId: org, id: dto.templateId, status: 'active' } });
      if (!t) throw new BadRequestException('Choose an active review template.');
      if (t.kind !== dto.kind) throw new BadRequestException(`That template is for ${t.kind.replace('_', '-')} reviews.`);
      const data = { name: dto.name, kind: dto.kind, periodFrom: asDate(dto.periodFrom), periodTo: asDate(dto.periodTo), templateId: t.id, scaleId: t.scaleId, population: population ? asJson(population) : Prisma.DbNull, stages: asJson(dto.stages.map((s) => ({ key: s.key, dueOn: s.dueOn, optional: Boolean(s.optional) }))), eligibilityRules: asJson({ cutoffMonths: dto.eligibilityRules.cutoffMonths, rateLeavers: dto.eligibilityRules.rateLeavers }) };
      if (!id) {
        const x = await tx.reviewCycle.create({ data: { organizationId: org, ...data, createdBy: v.userId } });
        await audit(tx, c, 'perf.cycle.created', 'review_cycle', x.id, { name: dto.name });
        return this.cycleView(x);
      }
      const n = await tx.reviewCycle.updateMany({ where: { organizationId: org, id, status: 'draft', version: dto.version ?? -1 }, data: { ...data, version: { increment: 1 } } });
      if (!n.count) {
        const cur = await tx.reviewCycle.findFirst({ where: { organizationId: org, id } });
        if (!cur) throw new NotFoundException('No such cycle.');
        throw new ConflictException(cur.status !== 'draft' ? 'A launched cycle keeps its set-up.' : 'Someone else changed this cycle. Reload it.');
      }
      await audit(tx, c, 'perf.cycle.updated', 'review_cycle', id, {});
      return this.cycleView(await tx.reviewCycle.findFirstOrThrow({ where: { id } }));
    });
  }

  /** The people of the company on the period, with today's job facts, joining and leaving dates and protected leave. */
  private async candidates(tx: Tx, org: string, x: Cycle) {
    const today = todayIst();
    return tx.$queryRaw<{ employee_id: string; employment_id: string; legal_entity_id: string; location_id: string; department_id: string; grade_id: string | null; designation_id: string; employment_type_id: string; manager_employee_id: string | null; joined_on: string; exited_on: string | null; protected_leave: boolean }[]>`
      SELECT DISTINCT ON (m.employee_id) m.employee_id::text, m.id::text AS employment_id, a.legal_entity_id::text, a.location_id::text, a.department_id::text,
             a.grade_id::text, a.designation_id::text, a.employment_type_id::text, a.manager_employee_id::text, m.joined_on::text, m.exited_on::text,
             EXISTS (SELECT 1 FROM leave_requests l JOIN leave_types lt ON lt.organization_id = l.organization_id AND lt.id = l.leave_type_id
                     WHERE l.organization_id = m.organization_id AND l.employee_id = m.employee_id AND l.status = 'approved'
                       AND lt.kind IN ('maternity', 'paternity') AND l.from_on <= ${x.periodTo} AND l.to_on >= ${x.periodFrom}) AS protected_leave
      FROM employments m
      JOIN employee_assignments a ON a.organization_id = m.organization_id AND a.employment_id = m.id AND a.superseded_at IS NULL
        AND a.valid_from <= LEAST(${today}::date, COALESCE(m.exited_on, ${today}::date)) AND (a.valid_to IS NULL OR a.valid_to >= LEAST(${today}::date, COALESCE(m.exited_on, ${today}::date)))
      WHERE m.organization_id = ${org}::uuid AND m.joined_on <= ${x.periodTo} AND (m.exited_on IS NULL OR m.exited_on >= ${x.periodFrom})
      ORDER BY m.employee_id, m.joined_on DESC`;
  }

  /** Who is in the cycle and under which J11 rule (§9.2). */
  private async eligibleRows(tx: Tx, org: string, x: Cycle) {
    const rules = { ...DEFAULT_RULES, ...(x.eligibilityRules as Partial<EligibilityRules>) };
    const population = x.population as Group | null;
    const today = todayIst();
    const out: { c: Awaited<ReturnType<PerformanceReviewsService['candidates']>>[number]; e: NonNullable<ReturnType<typeof eligibilityFor>> }[] = [];
    for (const c of await this.candidates(tx, org, x)) {
      if (population && !evaluate(population, { legal_entity_id: c.legal_entity_id, location_id: c.location_id, department_id: c.department_id, grade_id: c.grade_id, designation_id: c.designation_id, employment_type_id: c.employment_type_id }, APPLIES_FIELDS).pass) continue;
      const e = eligibilityFor({ joinedOn: c.joined_on, exitedOn: c.exited_on, periodFrom: iso(x.periodFrom), periodTo: iso(x.periodTo), today, protectedLeave: c.protected_leave }, rules);
      if (e) out.push({ c, e });
    }
    return out;
  }

  /** §6.3: a cycle launches only when its template and scale are sound, every reviewed person has a manager and every stage owner resolves. */
  private async problems(tx: Tx, org: string, x: Cycle): Promise<{ problems: Problem[]; rows: Awaited<ReturnType<PerformanceReviewsService['eligibleRows']>> }> {
    const problems: Problem[] = [];
    const t = await tx.reviewTemplate.findFirst({ where: { organizationId: org, id: x.templateId } });
    if (!t || t.status !== 'active') problems.push({ text: 'The template is no longer active.', fix: '/yx/settings/performance' });
    if (t) {
      const sections = await tx.reviewTemplateSection.findMany({ where: { organizationId: org, templateId: t.id } });
      const qs = await tx.reviewTemplateQuestion.findMany({ where: { organizationId: org, sectionId: { in: sections.map((s) => s.id) } } });
      const p = templateProblem(t.scoring as 'weighted' | 'manager_overall', sections.map((s): SectionIn => ({ kind: s.kind as SectionIn['kind'], title: s.title, weight: num(s.weight)!, rated: s.rated, whoAnswers: s.whoAnswers, questions: qs.filter((q) => q.sectionId === s.id).map((q) => ({ text: q.text, answer: q.answer as 'rating' })) })));
      if (p) problems.push({ text: `Template: ${p}`, fix: '/yx/settings/performance' });
    }
    const scale = await tx.ratingScale.findFirst({ where: { organizationId: org, id: x.scaleId } });
    const bands = await tx.ratingBand.findMany({ where: { organizationId: org, scaleId: x.scaleId } });
    const bp = scale ? bandsProblem(num(scale.minValue)!, num(scale.maxValue)!, bands.map((b) => ({ fromScore: num(b.fromScore)!, toScore: num(b.toScore)!, label: b.label }))) : 'The scale is missing.';
    if (bp) problems.push({ text: `Scale: ${bp}`, fix: '/yx/settings/performance' });
    const sp = stagesProblem(x.stages as StageIn[], x.status === 'draft' ? todayIst() : iso(x.createdAt));
    if (sp) problems.push({ text: sp, fix: null });
    const rows = await this.eligibleRows(tx, org, x);
    const reviewed = rows.filter((r) => r.e.reviewed);
    if (!reviewed.length) problems.push({ text: 'No one is reviewed in this cycle. Check who is in and the period.', fix: null });
    const people = await this.names(tx, org, reviewed.map((r) => r.c.employee_id));
    const noManager = reviewed.filter((r) => !r.c.manager_employee_id);
    for (const r of noManager.slice(0, 20)) problems.push({ text: `${people.get(r.c.employee_id)} has no manager.`, fix: `/yx/people/employees/${r.c.employee_id}` });
    if (noManager.length > 20) problems.push({ text: `${noManager.length - 20} more people have no manager.`, fix: null });
    if ((x.stages as StageIn[]).some((s) => s.key === 'skip')) {
      const mgrs = [...new Set(reviewed.map((r) => r.c.manager_employee_id).filter((m): m is string => Boolean(m)))];
      const above = new Map((await tx.$queryRaw<{ id: string; mgr: string | null }[]>`
        SELECT a.employee_id::text AS id, a.manager_employee_id::text AS mgr FROM employee_assignments a
        WHERE a.organization_id = ${org}::uuid AND a.employee_id = ANY(${mgrs}::uuid[]) AND a.superseded_at IS NULL
          AND a.valid_from <= ${todayIst()}::date AND (a.valid_to IS NULL OR a.valid_to >= ${todayIst()}::date)`).map((r) => [r.id, r.mgr]));
      const names = await this.names(tx, org, mgrs);
      for (const m of mgrs.filter((m) => !above.get(m)).slice(0, 20)) problems.push({ text: `${names.get(m)} has no manager for the skip-level stage.`, fix: `/yx/people/employees/${m}` });
    }
    return { problems, rows };
  }

  async preflight(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => {
      const x = await tx.reviewCycle.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!x) throw new NotFoundException('No such cycle.');
      const { problems, rows } = await this.problems(tx, c.organizationId, x);
      const count = (rule: string) => rows.filter((r) => r.e.rule === rule).length;
      return { problems, reviewed: rows.filter((r) => r.e.reviewed).length, excluded: rows.filter((r) => !r.e.reviewed).length, protectedLeave: count('protected_leave'), leavers: count('leaver') };
    });
  }

  /** Launch makes every eligibility row and every review (in chunks of 500, in one transaction: all or nothing). */
  async launch(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    const v = await this.viewer(user);
    this.manager(v);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await tx.reviewCycle.findFirst({ where: { organizationId: org, id } });
      if (!x) throw new NotFoundException('No such cycle.');
      if (x.status !== 'draft') throw new ConflictException('This cycle is already launched.');
      if (x.version !== version) throw new ConflictException('Someone else changed this cycle. Reload it.');
      const { problems, rows } = await this.problems(tx, org, x);
      if (problems.length) throw new ConflictException(`Fix these first: ${problems.map((p) => p.text).join(' ')}`);
      const first = (x.stages as StageIn[])[0].key;
      // shortcut: one request does the whole launch; move it to the performance queue with progress past ~5,000 people.
      for (let i = 0; i < rows.length; i += CHUNK) {
        const part = rows.slice(i, i + CHUNK);
        await tx.reviewEligibility.createMany({ data: part.map(({ c: p, e }) => ({ organizationId: org, cycleId: id, employeeId: p.employee_id, employmentId: p.employment_id, rule: e.rule, eligibleMonths: e.eligibleMonths, proration: e.proration, reviewed: e.reviewed, byUserId: v.userId })) });
        const reviewed = part.filter((r) => r.e.reviewed);
        await tx.review.createMany({ data: reviewed.map(({ c: p }) => ({ organizationId: org, cycleId: id, employeeId: p.employee_id, employmentId: p.employment_id, legalEntityId: p.legal_entity_id, managerEmployeeId: p.manager_employee_id!, stage: first })) });
      }
      const made = await tx.review.findMany({ where: { organizationId: org, cycleId: id }, select: { id: true, employeeId: true, managerEmployeeId: true } });
      for (let i = 0; i < made.length; i += CHUNK) {
        await tx.reviewStageLog.createMany({ data: made.slice(i, i + CHUNK).map((r) => ({ organizationId: org, reviewId: r.id, stage: first, toOwner: first === 'self' ? r.employeeId : r.managerEmployeeId, event: 'opened', byUserId: v.userId })) });
      }
      await tx.reviewCycle.update({ where: { id }, data: { status: 'launched', launchedAt: new Date(), version: { increment: 1 } } });
      await audit(tx, c, 'perf.cycle.launched', 'review_cycle', id, { reviews: made.length, eligibility: rows.length });
      const owners = first === 'self' ? made.map((r) => r.employeeId) : made.map((r) => r.managerEmployeeId);
      const users = (await tx.employee.findMany({ where: { organizationId: org, id: { in: [...new Set(owners)] } }, select: { userId: true } })).map((e) => e.userId);
      return { reviews: made.length, users, name: x.name };
    });
    void this.tell(ctx.organizationId!, out.users, 'perf.cycle.launched', `${out.name} has started`, '/yx/performance/reviews');
    return { reviews: out.reviews };
  }

  async eligibility(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.reviewEligibility.findMany({ where: { organizationId: c.organizationId, cycleId: id }, orderBy: { createdAt: 'asc' } });
      const people = await this.names(tx, c.organizationId, rows.map((r) => r.employeeId));
      return rows.map((r) => ({ id: r.id, employeeId: r.employeeId, name: people.get(r.employeeId) ?? '', rule: r.rule, eligibleMonths: num(r.eligibleMonths), proration: num(r.proration), reviewed: r.reviewed, overrideReason: r.overrideReason }));
    });
  }

  /** HR puts someone in or takes them out, with a reason (J11). Taking out closes their review; putting in opens one. */
  async override(ctx: TenantContext, user: ScopeUser, id: string, dto: OverrideDto) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = await tx.reviewEligibility.findFirst({ where: { organizationId: org, id } });
      if (!e) throw new NotFoundException('No such row.');
      const x = await tx.reviewCycle.findFirstOrThrow({ where: { id: e.cycleId } });
      if (x.status !== 'launched') throw new ConflictException('Only a running cycle changes who is in it.');
      if (e.reviewed === dto.reviewed) throw new ConflictException(dto.reviewed ? 'They are already reviewed.' : 'They are already left out.');
      await tx.reviewEligibility.update({ where: { id }, data: { reviewed: dto.reviewed, overrideReason: dto.reason, byUserId: v.userId } });
      const r = await tx.review.findFirst({ where: { organizationId: org, cycleId: x.id, employeeId: e.employeeId } });
      if (!dto.reviewed && r) {
        await tx.review.update({ where: { id: r.id }, data: { status: 'closed', stage: 'done', version: { increment: 1 } } });
        await tx.reviewStageLog.create({ data: { organizationId: org, reviewId: r.id, stage: 'done', event: 'skipped', reason: dto.reason, byUserId: v.userId } });
      } else if (dto.reviewed && r) {
        const first = (x.stages as StageIn[])[0].key;
        await tx.review.update({ where: { id: r.id }, data: { status: 'open', stage: first, version: { increment: 1 } } });
        await tx.reviewStageLog.create({ data: { organizationId: org, reviewId: r.id, stage: first, event: 'reopened', reason: dto.reason, byUserId: v.userId } });
      } else if (dto.reviewed) {
        const job = (await this.candidates(tx, org, x)).find((p) => p.employee_id === e.employeeId);
        if (!job?.manager_employee_id) throw new ConflictException('They need a manager before they can be reviewed.');
        const first = (x.stages as StageIn[])[0].key;
        const made = await tx.review.create({ data: { organizationId: org, cycleId: x.id, employeeId: e.employeeId, employmentId: e.employmentId, legalEntityId: job.legal_entity_id, managerEmployeeId: job.manager_employee_id, stage: first } });
        await tx.reviewStageLog.create({ data: { organizationId: org, reviewId: made.id, stage: first, toOwner: first === 'self' ? e.employeeId : job.manager_employee_id, event: 'opened', reason: dto.reason, byUserId: v.userId } });
      }
      await audit(tx, c, 'perf.eligibility.overridden', 'review_eligibility', id, { reviewed: dto.reviewed, reason: dto.reason });
      return { id, reviewed: dto.reviewed };
    });
  }

  async funnel(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => {
      const rows = await tx.review.groupBy({ by: ['stage'], where: { organizationId: c.organizationId, cycleId: id, status: { not: 'closed' } }, _count: { _all: true } });
      return STAGE_ORDER.map((s) => s as string).concat(['release', 'done']).map((stage) => ({ stage, label: STAGE_LABEL[stage], count: rows.find((r) => r.stage === stage)?._count._all ?? 0 }));
    });
  }

  // ------------------------------------------------------------------------------------------ reviews (PM-4.03, 4.04)

  private async managerOf(tx: Tx, org: string, employeeId: string, today = todayIst()) {
    const rows = await tx.$queryRaw<{ mgr: string | null }[]>`
      SELECT a.manager_employee_id::text AS mgr FROM employee_assignments a WHERE a.organization_id = ${org}::uuid AND a.employee_id = ${employeeId}::uuid
        AND a.superseded_at IS NULL AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date) ORDER BY a.valid_from DESC LIMIT 1`;
    return rows[0]?.mgr ?? null;
  }

  private async access(tx: Tx, c: CompanyContext, v: Viewer, r: Review) {
    const me = await this.me(tx, c.organizationId, v);
    const today = todayIst();
    const own = me === r.employeeId;
    const manager = me === r.managerEmployeeId;
    const skip = Boolean(me) && !own && !manager && (await this.managerOf(tx, c.organizationId, r.managerEmployeeId)) === me;
    const chain = !own && !manager && (skip || covers(started(await implicitPeriods(tx, c, me, r.employeeId), today), today));
    const scope = v.grants.has('perf.review.view') && covers(started(await grantPeriods(tx, c, v, 'perf.review.view', r.employeeId, me), today), today);
    return { me, own, manager, skip, chain, scope };
  }

  private async template(tx: Tx, org: string, cycle: Cycle) {
    const t = await tx.reviewTemplate.findFirstOrThrow({ where: { organizationId: org, id: cycle.templateId } });
    const sections = await tx.reviewTemplateSection.findMany({ where: { organizationId: org, templateId: t.id }, orderBy: { seq: 'asc' } });
    const questions = await tx.reviewTemplateQuestion.findMany({ where: { organizationId: org, sectionId: { in: sections.map((s) => s.id) } }, orderBy: { seq: 'asc' } });
    const levels = await tx.ratingScaleLevel.findMany({ where: { organizationId: org, scaleId: cycle.scaleId }, orderBy: { value: 'asc' } });
    const bands = await tx.ratingBand.findMany({ where: { organizationId: org, scaleId: cycle.scaleId }, orderBy: { fromScore: 'asc' } });
    return { t, sections, questions, levels, bands };
  }

  private nextStep(r: Review, cycle: Cycle, people: Map<string, string>) {
    const due = (cycle.stages as StageIn[]).find((s) => s.key === r.stage)?.dueOn ?? null;
    if (r.status === 'closed') return { stage: 'done', label: 'Closed', owner: null, dueOn: null };
    if (r.status === 'released') return { stage: 'done', label: 'Released: waiting for acknowledgement', owner: people.get(r.employeeId) ?? null, dueOn: null };
    if (r.status === 'acknowledged') return { stage: 'done', label: r.disagreement ? 'Acknowledged, with a disagreement for HR' : 'Acknowledged', owner: null, dueOn: null };
    const owner = r.stage === 'self' ? people.get(r.employeeId) : r.stage === 'manager' ? people.get(r.managerEmployeeId) : r.stage === 'skip' ? 'Skip-level manager' : 'HR';
    return { stage: r.stage, label: STAGE_LABEL[r.stage] ?? r.stage, owner: owner ?? null, dueOn: due };
  }

  async list(ctx: TenantContext, user: ScopeUser, view: 'mine' | 'team' | 'scope' = 'mine', cycleId?: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      const today = todayIst();
      const cycleSql = cycleId ? Prisma.sql`AND r.cycle_id = ${cycleId}::uuid` : Prisma.empty;
      let ids: { id: string }[] = [];
      if (view === 'mine') ids = me ? await tx.$queryRaw`SELECT r.id::text FROM reviews r WHERE r.organization_id = ${org}::uuid AND r.employee_id = ${me}::uuid ${cycleSql}` : [];
      else if (view === 'team') ids = me ? await tx.$queryRaw`SELECT r.id::text FROM reviews r WHERE r.organization_id = ${org}::uuid AND r.employee_id <> ${me}::uuid ${cycleSql} AND (r.manager_employee_id = ${me}::uuid OR ${await implicitSql(tx, c, me, Prisma.sql`r.employee_id`, Prisma.sql`${today}::date`)})` : [];
      else {
        if (!v.grants.has('perf.review.view')) throw new ForbiddenException('Reviews of people in scope need perf.review.view.');
        ids = await tx.$queryRaw`SELECT r.id::text FROM reviews r WHERE r.organization_id = ${org}::uuid ${cycleSql} AND ${inScopeSql(c, v, 'perf.review.view', Prisma.sql`r.employee_id`, Prisma.sql`${today}::date`, me)} LIMIT 2000`;
      }
      const rows = await tx.review.findMany({ where: { organizationId: org, id: { in: ids.map((x) => x.id) } }, orderBy: { createdAt: 'desc' } });
      const cycles = new Map((await tx.reviewCycle.findMany({ where: { organizationId: org, id: { in: [...new Set(rows.map((r) => r.cycleId))] } } })).map((x) => [x.id, x]));
      const people = await this.names(tx, org, rows.flatMap((r) => [r.employeeId, r.managerEmployeeId]));
      return rows.map((r) => {
        const own = r.employeeId === me;
        const released = Boolean(r.releasedAt);
        return {
          id: r.id,
          cycle: cycles.get(r.cycleId)!.name,
          cycleId: r.cycleId,
          employee: people.get(r.employeeId) ?? '',
          employeeId: r.employeeId,
          manager: people.get(r.managerEmployeeId) ?? '',
          status: r.status,
          next: this.nextStep(r, cycles.get(r.cycleId)!, people),
          // The employee sees no score before release (YX-PERF-09, U69).
          finalScore: own && !released ? null : num(r.finalScore),
          band: own && !released ? null : r.band,
        };
      });
    });
  }

  async get(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.review.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such review.');
      const a = await this.access(tx, c, v, r);
      const mineOther = v.userId ? await tx.reviewEntry.findFirst({ where: { organizationId: org, reviewId: id, stage: 'other', authorUserId: v.userId } }) : null;
      if (!a.own && !a.manager && !a.chain && !a.scope && !mineOther) throw new NotFoundException('No such review.');
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId } });
      const tpl = await this.template(tx, org, cycle);
      const { t, sections, levels, bands } = tpl;
      const items = this.items(tpl);
      const goals = await tx.$queryRaw<{ id: string; title: string; progress: number; weight: number; status: string }[]>`
        SELECT g.id::text, g.title, g.progress::float8 AS progress, g.weight::float8 AS weight, g.status FROM goals g JOIN goal_periods p ON p.organization_id = g.organization_id AND p.id = g.period_id
        WHERE g.organization_id = ${org}::uuid AND g.owner_type = 'person' AND g.owner_employee_id = ${r.employeeId}::uuid AND g.status IN ('active', 'done')
          AND p.from_on <= ${cycle.periodTo} AND p.to_on >= ${cycle.periodFrom} ORDER BY g.weight DESC, g.title`;
      const entries = await tx.reviewEntry.findMany({ where: { organizationId: org, reviewId: id, stage: { in: ['self', 'manager', 'skip', 'other'] } } });
      const self = entries.find((e) => e.stage === 'self') ?? null;
      // Only the current manager's entry counts: a former manager's draft stays theirs (D7).
      const mgr = entries.find((e) => e.stage === 'manager' && e.authorEmployeeId === r.managerEmployeeId) ?? null;
      const skipEntry = entries.find((e) => e.stage === 'skip' && e.status === 'submitted') ?? null;
      const days = Number(await settingFor(tx, c, 'perf.disagreement.days', { legalEntityId: r.legalEntityId }));
      const disagreeBy = r.releasedAt ? addDays(iso(r.releasedAt), days) : null;
      const disagreements = a.own || a.scope || v.grants.has('perf.cycle.manage') ? await tx.reviewDisagreement.findMany({ where: { organizationId: org, reviewId: id }, orderBy: { createdAt: 'asc' } }) : [];
      const released = Boolean(r.releasedAt);
      const afterDraft = (await settingFor(tx, c, 'perf.self_review.visible_to_manager', { legalEntityId: r.legalEntityId })) === 'after_manager_draft';
      // Before release the employee sees only their own self review; the manager sees the submitted self review once they
      // have saved a draft of their own (anti-anchoring, §9.3); the chain above and HR in scope read both.
      // A named other reviewer (a former manager, D7) sees only the template and their own input.
      const onlyOther = Boolean(mineOther) && !a.own && !a.manager && !a.chain && !a.scope;
      const showSelf = !onlyOther && (a.own || ((a.manager || a.chain || a.scope) && self?.status === 'submitted' && (!a.manager || !afterDraft || Boolean(mgr))));
      const showManager = !onlyOther && (!a.own || released);
      const entry = (e: typeof self) => (e ? { status: e.status, answers: e.answers, overallRating: num(e.overallRating), comment: e.comment, submittedAt: e.submittedAt?.toISOString() ?? null, version: e.version } : null);
      const people = await this.names(tx, org, [r.employeeId, r.managerEmployeeId]);
      const log = await tx.reviewStageLog.findMany({ where: { organizationId: org, reviewId: id }, orderBy: { at: 'asc' } });
      const open = r.status === 'open';
      return {
        id: r.id,
        cycle: { id: cycle.id, name: cycle.name, periodFrom: iso(cycle.periodFrom), periodTo: iso(cycle.periodTo), stages: cycle.stages as StageIn[] },
        employee: people.get(r.employeeId) ?? '',
        employeeId: r.employeeId,
        manager: people.get(r.managerEmployeeId) ?? '',
        role: a.own ? 'employee' : a.manager ? 'manager' : onlyOther ? 'other' : 'viewer',
        status: r.status,
        next: this.nextStep(r, cycle, people),
        template: {
          name: t.name,
          scoring: t.scoring,
          sections: sections.map((s) => ({ id: s.id, kind: s.kind, title: s.title, weight: num(s.weight), rated: s.rated, whoAnswers: s.whoAnswers, questions: items.filter((q) => q.sectionId === s.id).map((q) => ({ id: q.id, text: q.text, answer: q.answer, required: q.required, maxChars: q.maxChars, wholeSection: q.id === s.id })) })),
          levels: levels.map((l) => ({ value: num(l.value), label: l.label })),
        },
        goals,
        self: showSelf ? entry(self) : null,
        selfSubmitted: self?.status === 'submitted',
        managerEntry: showManager ? entry(mgr) : null,
        finalScore: showManager ? num(r.finalScore) : null,
        band: showManager ? r.band : null,
        excludedSections: showManager ? ((r.excludedSections as string[] | null) ?? []) : [],
        bands: bands.map((b) => ({ fromScore: num(b.fromScore), toScore: num(b.toScore), label: b.label })),
        trail: log.map((l) => ({ stage: l.stage, event: l.event, reason: l.reason, at: l.at.toISOString() })),
        skipComment: showManager ? (skipEntry?.comment ?? null) : null,
        // Named other reviewers: advisory, never in the score; the employee does not see them.
        others: !a.own && showManager ? await this.otherViews(tx, org, entries.filter((e) => e.stage === 'other')) : [],
        otherEntry: mineOther ? entry(mineOther) : null,
        formerManagers: tenantWide(v, 'perf.cycle.manage') && !v.actingForOther ? await this.formerManagers(tx, org, id) : [],
        released: released ? { at: r.releasedAt!.toISOString(), acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null, acknowledgeComment: r.acknowledgeComment, disagreeBy } : null,
        disagreements: disagreements.map((d) => ({ id: d.id, text: d.text, status: d.status, hrNote: d.hrNote })),
        can: {
          self: a.own && open && r.stage === 'self' && self?.status !== 'submitted',
          manager: a.manager && open && (r.stage === 'self' || r.stage === 'manager') && mgr?.status !== 'submitted',
          skip: a.skip && open && r.stage === 'skip',
          other: Boolean(mineOther) && open && mineOther!.status !== 'submitted',
          addOther: tenantWide(v, 'perf.cycle.manage') && !v.actingForOther && open,
          acknowledge: a.own && r.status === 'released',
          disagree: a.own && released && !r.disagreement && (r.status === 'released' || r.status === 'acknowledged') && todayIst() <= disagreeBy!,
          reopen: tenantWide(v, 'perf.cycle.manage') && !v.actingForOther && ['ready', 'released', 'acknowledged'].includes(r.status),
        },
        version: r.version,
      };
    });
  }

  // Shared with the peer service (PM5): the same access rules, template and answer checks.
  accessOf(tx: Tx, c: CompanyContext, v: Viewer, r: Review) {
    return this.access(tx, c, v, r);
  }

  templateOf(tx: Tx, org: string, cycle: Cycle) {
    return this.template(tx, org, cycle);
  }

  itemsOf(tpl: Awaited<ReturnType<PerformanceReviewsService['template']>>) {
    return this.items(tpl);
  }

  answersFor(stage: 'peer', tpl: Awaited<ReturnType<PerformanceReviewsService['template']>>, dto: EntryDto, submit: boolean) {
    return this.checkAnswers(stage, tpl, dto, submit);
  }

  /** What a stage answers: every question, and each rated section without questions as one rating of the whole section. */
  private items(tpl: Awaited<ReturnType<PerformanceReviewsService['template']>>) {
    return [
      ...tpl.questions.map((q) => ({ id: q.id, sectionId: q.sectionId, text: q.text, answer: q.answer, required: q.required, maxChars: q.maxChars })),
      ...tpl.sections.filter((s) => s.rated && !tpl.questions.some((q) => q.sectionId === s.id)).map((s) => ({ id: s.id, sectionId: s.id, text: s.title, answer: 'both', required: false, maxChars: 2000 })),
    ];
  }

  /** Checks one entry against the template: only the stage's questions, ratings on the scale, texts within their limit. */
  private checkAnswers(stage: StageKey | 'peer', tpl: Awaited<ReturnType<PerformanceReviewsService['template']>>, dto: EntryDto, submit: boolean) {
    const qs = this.items(tpl).filter((q) => tpl.sections.find((s) => s.id === q.sectionId)!.whoAnswers.includes(stage));
    const byId = new Map(qs.map((q) => [q.id, q]));
    const values = new Set(tpl.levels.map((l) => num(l.value)));
    const answers: Record<string, { rating: number | null; text: string | null }> = {};
    for (const a of dto.answers) {
      const q = byId.get(a.questionId);
      if (!q) throw new BadRequestException('An answer is for a question this stage does not answer.');
      if (a.rating !== null && a.rating !== undefined && (q.answer === 'text' || !values.has(a.rating))) throw new BadRequestException(`"${q.text}" takes a rating on the scale.`);
      const text = a.text?.trim() || null;
      if (text && q.answer === 'rating') throw new BadRequestException(`"${q.text}" takes a rating only.`);
      if (text && text.length > q.maxChars) throw new BadRequestException(`"${q.text}" is limited to ${q.maxChars} characters.`);
      answers[q.id] = { rating: a.rating ?? null, text };
    }
    if (dto.overallRating !== null && dto.overallRating !== undefined && !values.has(dto.overallRating)) throw new BadRequestException('The overall rating is not on the scale.');
    if (submit) {
      for (const q of qs.filter((x) => x.required)) {
        const a = answers[q.id];
        if (q.answer === 'text' ? !a?.text : a?.rating === null || a?.rating === undefined) throw new BadRequestException(`Answer "${q.text}" before you submit.`);
      }
      if (stage === 'manager' && tpl.t.scoring === 'manager_overall' && (dto.overallRating === null || dto.overallRating === undefined)) throw new BadRequestException('Give the overall rating before you submit.');
    }
    return answers;
  }

  async saveEntry(ctx: TenantContext, user: ScopeUser, id: string, stage: StageKey, dto: EntryDto, submit: boolean) {
    const v = await this.viewer(user);
    if (stage !== 'self' && stage !== 'manager') throw new BadRequestException('Only the self and manager stages are answered here.');
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.review.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such review.');
      const a = await this.access(tx, c, v, r);
      if (!(stage === 'self' ? a.own : a.manager)) {
        if (a.own || a.manager || a.chain || a.scope) throw new ForbiddenException(stage === 'self' ? 'Only the employee answers the self review.' : 'Only the current manager answers the manager review.');
        throw new NotFoundException('No such review.');
      }
      if (r.status !== 'open') throw new ConflictException('This review is no longer open.');
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId } });
      const stages = cycle.stages as StageIn[];
      if (stage === 'self' && r.stage !== 'self') throw new ConflictException('The self review is closed.');
      if (stage === 'manager' && r.stage !== 'self' && r.stage !== 'manager') throw new ConflictException('The manager review is closed.');
      const tpl = await this.template(tx, org, cycle);
      const answers = this.checkAnswers(stage, tpl, dto, submit);
      const cur = await tx.reviewEntry.findFirst({ where: { organizationId: org, reviewId: id, stage, authorUserId: v.userId! } });
      if (cur?.status === 'submitted') throw new ConflictException('This review is already submitted.');
      if (submit && stage === 'manager' && r.stage === 'self') {
        const s = stages.find((x) => x.key === 'self')!;
        // The manager waits for the self review unless it is optional or its deadline has passed.
        if (!s.optional && todayIst() <= s.dueOn) throw new ConflictException(`Wait for the self review, due ${s.dueOn}, before you submit.`);
      }
      const data = { answers: asJson(answers), overallRating: dto.overallRating ?? null, comment: dto.comment?.trim() || null, ...(submit ? { status: 'submitted', submittedAt: new Date() } : {}) };
      if (cur) await tx.reviewEntry.update({ where: { id: cur.id }, data: { ...data, version: { increment: 1 } } });
      else await tx.reviewEntry.create({ data: { organizationId: org, reviewId: id, stage, authorUserId: v.userId!, authorEmployeeId: a.me, relationship: stage, ...data } });
      if (!submit) return { notify: [] as (string | null)[], type: '' };

      const at = (k: string) => stages.findIndex((x) => x.key === k);
      let next: string;
      const log: Prisma.ReviewStageLogCreateManyInput[] = [];
      const patch: Prisma.ReviewUpdateInput = {};
      if (stage === 'self') {
        next = 'manager';
        log.push({ organizationId: org, reviewId: id, stage: 'self', fromOwner: r.employeeId, toOwner: r.managerEmployeeId, event: 'submitted', byUserId: v.userId });
      } else {
        if (r.stage === 'self') log.push({ organizationId: org, reviewId: id, stage: 'self', fromOwner: r.employeeId, event: 'skipped', reason: 'The manager submitted after the self review closed.', byUserId: v.userId });
        const score = scoreReview(tpl.t.scoring as 'weighted' | 'manager_overall', tpl.sections.map((s) => ({ id: s.id, title: s.title, weight: num(s.weight)!, rated: s.rated, questionIds: this.items(tpl).filter((q) => q.sectionId === s.id).map((q) => q.id) })), answers, dto.overallRating ?? null);
        if (score.finalScore === null) throw new BadRequestException('Rate at least one section before you submit.');
        const band = score.finalScore === null ? null : bandFor(tpl.bands.map((b) => ({ fromScore: num(b.fromScore)!, toScore: num(b.toScore)!, label: b.label })), score.finalScore)?.label ?? null;
        Object.assign(patch, { sectionScores: asJson(score.sectionScores), excludedSections: asJson(score.excluded), finalScore: score.finalScore, band });
        next = at('skip') > at('manager') ? 'skip' : 'release';
        log.push({ organizationId: org, reviewId: id, stage: 'manager', fromOwner: r.managerEmployeeId, event: 'submitted', byUserId: v.userId });
        if (next === 'release') patch.status = 'ready';
      }
      const n = await tx.review.updateMany({ where: { id, version: r.version }, data: { ...(patch as Prisma.ReviewUpdateManyMutationInput), stage: next, remindedOn: null, version: { increment: 1 } } });
      if (!n.count) throw new ConflictException('Someone else changed this review. Reload it.');
      await tx.reviewStageLog.createMany({ data: log });
      await audit(tx, c, `perf.review.${stage}_submitted`, 'review', id, {});
      if (next === 'manager') return { notify: [(await tx.employee.findFirst({ where: { id: r.managerEmployeeId }, select: { userId: true } }))?.userId ?? null], type: 'perf.review.stage_due' };
      return { notify: [] as (string | null)[], type: '' };
    });
    if (out.notify.length) void this.tell(ctx.organizationId!, out.notify, out.type, 'A review is ready for you', `/yx/performance/reviews/${id}`);
    return this.get(ctx, user, id);
  }

  // ------------------------------------------------------------------------------------------ skip-level (PM-4.05)

  /** The manager's manager agrees, with an optional comment, or sends the review back to the manager with a reason. */
  async skipDecide(ctx: TenantContext, user: ScopeUser, id: string, agree: boolean, text: string | null) {
    const v = await this.viewer(user);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.review.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such review.');
      const a = await this.access(tx, c, v, r);
      if (!a.skip) {
        if (a.own || a.manager || a.chain || a.scope) throw new ForbiddenException('Only the manager\u2019s manager does the skip-level review.');
        throw new NotFoundException('No such review.');
      }
      if (r.status !== 'open' || r.stage !== 'skip') throw new ConflictException('This review is not at the skip-level stage.');
      if (agree) {
        await tx.reviewEntry.upsert({ where: { reviewId_stage_authorUserId: { reviewId: id, stage: 'skip', authorUserId: v.userId! } }, create: { organizationId: org, reviewId: id, stage: 'skip', authorUserId: v.userId!, authorEmployeeId: a.me, relationship: 'skip', comment: text, status: 'submitted', submittedAt: new Date() }, update: { comment: text, status: 'submitted', submittedAt: new Date(), version: { increment: 1 } } });
        await tx.review.update({ where: { id }, data: { stage: 'release', status: 'ready', remindedOn: null, version: { increment: 1 } } });
        await tx.reviewStageLog.create({ data: { organizationId: org, reviewId: id, stage: 'skip', fromOwner: a.me, event: 'submitted', byUserId: v.userId } });
        await audit(tx, c, 'perf.review.skip_agreed', 'review', id, {});
        return null;
      }
      // Sent back: the manager's review opens again as a draft; the score is worked out again on their next submit.
      await tx.reviewEntry.updateMany({ where: { organizationId: org, reviewId: id, stage: 'manager', authorEmployeeId: r.managerEmployeeId }, data: { status: 'draft', submittedAt: null } });
      await tx.review.update({ where: { id }, data: { stage: 'manager', finalScore: null, band: null, sectionScores: Prisma.DbNull, excludedSections: Prisma.DbNull, remindedOn: null, version: { increment: 1 } } });
      await tx.reviewStageLog.create({ data: { organizationId: org, reviewId: id, stage: 'skip', fromOwner: a.me, toOwner: r.managerEmployeeId, event: 'sent_back', reason: text, byUserId: v.userId } });
      await audit(tx, c, 'perf.review.sent_back', 'review', id, { reason: text });
      return (await tx.employee.findFirst({ where: { id: r.managerEmployeeId }, select: { userId: true } }))?.userId ?? null;
    });
    if (out) void this.tell(ctx.organizationId!, [out], 'perf.review.stage_due', 'A review was sent back to you', `/yx/performance/reviews/${id}`);
    return this.get(ctx, user, id);
  }

  // ------------------------------------------------------------------------------------------ release (PM-4.06)

  /** HR releases every ready review of the cycle; later ones can be released by running it again. */
  async release(ctx: TenantContext, user: ScopeUser, cycleId: string) {
    const v = await this.viewer(user);
    this.manager(v);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const x = await tx.reviewCycle.findFirst({ where: { organizationId: org, id: cycleId } });
      if (!x) throw new NotFoundException('No such cycle.');
      if (x.status !== 'launched' && x.status !== 'released') throw new ConflictException('Only a running cycle is released.');
      const ready = await tx.review.findMany({ where: { organizationId: org, cycleId, status: 'ready' }, select: { id: true, employeeId: true } });
      if (!ready.length) throw new ConflictException('No review is ready to release.');
      const now = new Date();
      await tx.review.updateMany({ where: { organizationId: org, id: { in: ready.map((r) => r.id) } }, data: { status: 'released', stage: 'done', releasedAt: now, version: { increment: 1 } } });
      await tx.reviewStageLog.createMany({ data: ready.map((r) => ({ organizationId: org, reviewId: r.id, stage: 'release', event: 'released', byUserId: v.userId, at: now })) });
      await tx.reviewCycle.update({ where: { id: cycleId }, data: { status: 'released', releasedAt: x.releasedAt ?? now, version: { increment: 1 } } });
      const notReady = await tx.review.count({ where: { organizationId: org, cycleId, status: 'open' } });
      await audit(tx, c, 'perf.cycle.released', 'review_cycle', cycleId, { released: ready.length, notReady });
      const users = (await tx.employee.findMany({ where: { organizationId: org, id: { in: ready.map((r) => r.employeeId) } }, select: { userId: true } })).map((e) => e.userId);
      return { released: ready.length, notReady, users };
    });
    void this.tell(ctx.organizationId!, out.users, 'perf.review.released', 'Your review is ready to read', '/yx/performance/reviews');
    return { released: out.released, notReady: out.notReady };
  }

  /** The employee acknowledges; the rating does not change. */
  async acknowledge(ctx: TenantContext, user: ScopeUser, id: string, comment: string | null) {
    const v = await this.viewer(user);
    await this.run(ctx, async (tx, c) => {
      const r = await tx.review.findFirst({ where: { organizationId: c.organizationId, id } });
      if (!r || (await this.me(tx, c.organizationId, v)) !== r.employeeId) throw new NotFoundException('No such review.');
      if (r.status !== 'released') throw new ConflictException(r.status === 'acknowledged' ? 'You already acknowledged this review.' : 'This review is not released yet.');
      await tx.review.update({ where: { id }, data: { status: 'acknowledged', acknowledgedAt: new Date(), acknowledgeComment: comment, version: { increment: 1 } } });
      await tx.reviewStageLog.create({ data: { organizationId: c.organizationId, reviewId: id, stage: 'done', event: 'acknowledged', byUserId: v.userId } });
    });
    return this.get(ctx, user, id);
  }

  /** PRF-15: within perf.disagreement.days of release the employee may disagree; HR answers. */
  async disagree(ctx: TenantContext, user: ScopeUser, id: string, text: string) {
    const v = await this.viewer(user);
    const hr = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.review.findFirst({ where: { organizationId: org, id } });
      if (!r || (await this.me(tx, org, v)) !== r.employeeId) throw new NotFoundException('No such review.');
      if (!r.releasedAt || (r.status !== 'released' && r.status !== 'acknowledged')) throw new ConflictException('You can disagree once the review is released.');
      if (r.disagreement) throw new ConflictException('You already raised a disagreement on this review.');
      const days = Number(await settingFor(tx, c, 'perf.disagreement.days', { legalEntityId: r.legalEntityId }));
      if (todayIst() > addDays(iso(r.releasedAt), days)) throw new ConflictException(`A disagreement is raised within ${days} days of release.`);
      await tx.reviewDisagreement.create({ data: { organizationId: org, reviewId: id, text } });
      await tx.review.update({ where: { id }, data: { disagreement: true, version: { increment: 1 } } });
      await audit(tx, c, 'perf.review.disagreed', 'review', id, {});
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId } });
      return [...(await holdersOf(tx, org, 'perf.cycle.manage', r.employeeId, todayIst())), cycle.createdBy];
    });
    void this.tell(ctx.organizationId!, hr, 'perf.review.disagreed', 'An employee disagrees with their review', '/yx/performance/cycles');
    return this.get(ctx, user, id);
  }

  async disagreements(ctx: TenantContext, user: ScopeUser, cycleId: string) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const rows = await tx.$queryRaw<{ id: string; review_id: string; employee_id: string; text: string; status: string; hr_note: string | null; created_at: Date }[]>`
        SELECT d.id::text, d.review_id::text, r.employee_id::text, d.text, d.status, d.hr_note, d.created_at FROM review_disagreements d
        JOIN reviews r ON r.organization_id = d.organization_id AND r.id = d.review_id WHERE d.organization_id = ${org}::uuid AND r.cycle_id = ${cycleId}::uuid ORDER BY d.created_at`;
      const people = await this.names(tx, org, rows.map((r) => r.employee_id));
      return rows.map((d) => ({ id: d.id, reviewId: d.review_id, employee: people.get(d.employee_id) ?? '', text: d.text, status: d.status, hrNote: d.hr_note, at: d.created_at.toISOString() }));
    });
  }

  async decideDisagreement(ctx: TenantContext, user: ScopeUser, id: string, dto: DecideDisagreementDto) {
    const v = await this.viewer(user);
    this.manager(v);
    return this.run(ctx, async (tx, c) => {
      const n = await tx.reviewDisagreement.updateMany({ where: { organizationId: c.organizationId, id, status: 'open' }, data: { status: dto.status, hrNote: dto.hrNote, decidedBy: v.userId, decidedAt: new Date() } });
      if (!n.count) throw new ConflictException('This disagreement is already answered, or does not exist.');
      await audit(tx, c, 'perf.disagreement.decided', 'review_disagreement', id, { status: dto.status });
      return { id, status: dto.status };
    });
  }

  /** A changed rating goes back through the manager: HR reopens with a reason, audited; the employee sees nothing until the next release. */
  async reopen(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const v = await this.viewer(user);
    this.manager(v);
    await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.review.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such review.');
      if (!['ready', 'released', 'acknowledged'].includes(r.status)) throw new ConflictException('Only a finished review is reopened.');
      await tx.reviewEntry.updateMany({ where: { organizationId: org, reviewId: id, stage: { in: ['manager', 'skip'] } }, data: { status: 'draft', submittedAt: null } });
      await tx.review.update({ where: { id }, data: { status: 'open', stage: 'manager', releasedAt: null, acknowledgedAt: null, finalScore: null, band: null, sectionScores: Prisma.DbNull, excludedSections: Prisma.DbNull, reopenedReason: reason, remindedOn: null, version: { increment: 1 } } });
      await tx.reviewStageLog.create({ data: { organizationId: org, reviewId: id, stage: 'manager', toOwner: r.managerEmployeeId, event: 'reopened', reason, byUserId: v.userId } });
      await audit(tx, c, 'perf.review.reopened', 'review', id, { reason, from: r.status, finalScore: num(r.finalScore) });
    });
    return this.get(ctx, user, id);
  }

  // ------------------------------------------------------------------------------------------ manager hand-over (PM-4.07, D7)

  async handOverAll(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT organization_id::text AS id FROM reviews WHERE status = 'open' UNION SELECT organization_id::text FROM one_on_one_actions WHERE done_at IS NULL`);
    for (const { id: org } of orgs) {
      try {
        await this.handOver(org, today);
      } catch (e) {
        this.logger.warn(`review hand-over ${org}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * D7: an open review whose employee now reports to someone else moves to the new manager on the day it takes effect.
   * The move is logged for both managers; goals aligned to the old manager's personal goal are flagged for re-parenting.
   */
  async handOver(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const moved = await this.tenantPrisma.forTenant(c, async (tx) => {
      const rows = await tx.$queryRaw<{ id: string; employee_id: string; old: string; new: string }[]>`
        SELECT r.id::text, r.employee_id::text, r.manager_employee_id::text AS old, a.manager_employee_id::text AS new
        FROM reviews r JOIN employee_assignments a ON a.organization_id = r.organization_id AND a.employee_id = r.employee_id AND a.superseded_at IS NULL
          AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
        WHERE r.organization_id = ${org}::uuid AND r.status = 'open' AND a.manager_employee_id IS NOT NULL AND a.manager_employee_id <> r.manager_employee_id`;
      for (const r of rows) {
        await tx.review.update({ where: { id: r.id }, data: { managerEmployeeId: r.new, remindedOn: null, version: { increment: 1 } } });
        await tx.reviewStageLog.create({ data: { organizationId: org, reviewId: r.id, stage: 'manager', fromOwner: r.old, toOwner: r.new, event: 'reassigned', reason: 'The manager changed.' } });
        await tx.perfOwnerTransfer.create({ data: { organizationId: org, employeeId: r.employee_id, oldManagerEmployeeId: r.old, newManagerEmployeeId: r.new, effectiveOn: asDate(today), artefactType: 'review', artefactId: r.id } });
        const parented = await tx.$queryRaw<{ id: string }[]>`
          SELECT g.id::text FROM goals g JOIN goals p ON p.organization_id = g.organization_id AND p.id = g.parent_goal_id
          WHERE g.organization_id = ${org}::uuid AND g.owner_employee_id = ${r.employee_id}::uuid AND g.status IN ('draft', 'submitted', 'active')
            AND p.owner_type = 'person' AND p.owner_employee_id = ${r.old}::uuid`;
        for (const g of parented) await tx.perfOwnerTransfer.create({ data: { organizationId: org, employeeId: r.employee_id, oldManagerEmployeeId: r.old, newManagerEmployeeId: r.new, effectiveOn: asDate(today), artefactType: 'goal_parent', artefactId: g.id, decisionNeeded: true } });
      }
      // Open 1:1 action items of the old pair move to the next 1:1 with the new manager (made a week out if none is planned).
      const pairs = await tx.$queryRaw<{ employee_id: string; old: string; new: string }[]>`
        SELECT DISTINCT o.employee_id::text, o.manager_employee_id::text AS old, a.manager_employee_id::text AS new
        FROM one_on_one_actions x JOIN one_on_ones o ON o.organization_id = x.organization_id AND o.id = x.one_on_one_id
        JOIN employee_assignments a ON a.organization_id = o.organization_id AND a.employee_id = o.employee_id AND a.superseded_at IS NULL
          AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)
        WHERE x.organization_id = ${org}::uuid AND x.done_at IS NULL AND a.manager_employee_id IS NOT NULL AND a.manager_employee_id <> o.manager_employee_id`;
      for (const p of pairs) {
        let next = await tx.oneOnOne.findFirst({ where: { organizationId: org, employeeId: p.employee_id, managerEmployeeId: p.new, status: 'planned', on: { gte: asDate(today) } }, orderBy: { on: 'asc' } });
        next ??= await tx.oneOnOne.create({ data: { organizationId: org, employeeId: p.employee_id, managerEmployeeId: p.new, on: asDate(addDays(today, 7)) } });
        const old = await tx.oneOnOne.findMany({ where: { organizationId: org, employeeId: p.employee_id, managerEmployeeId: p.old }, select: { id: true } });
        await tx.oneOnOneAction.updateMany({ where: { organizationId: org, oneOnOneId: { in: old.map((o) => o.id) }, doneAt: null }, data: { oneOnOneId: next.id } });
        await tx.perfOwnerTransfer.create({ data: { organizationId: org, employeeId: p.employee_id, oldManagerEmployeeId: p.old, newManagerEmployeeId: p.new, effectiveOn: asDate(today), artefactType: 'one_on_one_actions', artefactId: next.id } });
      }
      const to = [...rows.map((r) => r.new), ...pairs.map((p) => p.new)];
      return (await tx.employee.findMany({ where: { organizationId: org, id: { in: to } }, select: { userId: true } })).map((e) => e.userId);
    });
    await this.tell(org, moved, 'perf.review.stage_due', 'A review was handed over to you', '/yx/performance/reviews');
    return moved.filter(Boolean).length;
  }

  private async otherViews(tx: Tx, org: string, rows: Prisma.ReviewEntryGetPayload<object>[]) {
    const people = await this.names(tx, org, rows.map((e) => e.authorEmployeeId));
    return rows.map((e) => ({ name: people.get(e.authorEmployeeId ?? '') ?? '', status: e.status, answers: e.status === 'submitted' ? e.answers : null, comment: e.status === 'submitted' ? e.comment : null }));
  }

  private async formerManagers(tx: Tx, org: string, reviewId: string) {
    const ids = (await tx.perfOwnerTransfer.findMany({ where: { organizationId: org, artefactType: 'review', artefactId: reviewId }, select: { oldManagerEmployeeId: true } })).map((t) => t.oldManagerEmployeeId).filter((x): x is string => Boolean(x));
    const people = await this.names(tx, org, ids);
    return [...new Set(ids)].map((x) => ({ value: x, label: people.get(x) ?? '' }));
  }

  /** D7: HR adds a former manager of this review, still employed, as a named other reviewer. */
  async addOther(ctx: TenantContext, user: ScopeUser, id: string, employeeId: string) {
    const v = await this.viewer(user);
    this.manager(v);
    const out = await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const r = await tx.review.findFirst({ where: { organizationId: org, id } });
      if (!r) throw new NotFoundException('No such review.');
      if (r.status !== 'open') throw new ConflictException('Only an open review takes another reviewer.');
      const was = await tx.perfOwnerTransfer.findFirst({ where: { organizationId: org, artefactType: 'review', artefactId: id, oldManagerEmployeeId: employeeId } });
      if (!was) throw new BadRequestException('Only a former manager of this review is added as another reviewer.');
      const today = todayIst();
      const still = await tx.$queryRaw<{ user_id: string | null }[]>`
        SELECT e.user_id::text FROM employees e JOIN employments m ON m.organization_id = e.organization_id AND m.employee_id = e.id
        WHERE e.organization_id = ${org}::uuid AND e.id = ${employeeId}::uuid AND (m.exited_on IS NULL OR m.exited_on >= ${today}::date) LIMIT 1`;
      if (!still.length) throw new ConflictException('They have left the company, so they cannot review.');
      if (!still[0].user_id) throw new ConflictException('They have no YukthiX login to review with.');
      const made = await tx.reviewEntry.createMany({ data: [{ organizationId: org, reviewId: id, stage: 'other', authorUserId: still[0].user_id, authorEmployeeId: employeeId, relationship: 'other' }], skipDuplicates: true });
      if (!made.count) throw new ConflictException('They are already reviewing this.');
      await audit(tx, c, 'perf.review.other_added', 'review', id, { employeeId });
      return still[0].user_id;
    });
    void this.tell(ctx.organizationId!, [out], 'perf.review.stage_due', 'You were asked to add to a review', `/yx/performance/reviews/${id}`);
    return this.get(ctx, user, id);
  }

  /** The other reviewer answers the manager's questions; advisory, never scored, never shown to the employee. */
  async saveOther(ctx: TenantContext, user: ScopeUser, id: string, dto: EntryDto, submit: boolean) {
    const v = await this.viewer(user);
    await this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const e = v.userId ? await tx.reviewEntry.findFirst({ where: { organizationId: org, reviewId: id, stage: 'other', authorUserId: v.userId } }) : null;
      if (!e) throw new NotFoundException('No such review.');
      if (e.status === 'submitted') throw new ConflictException('You already sent your input.');
      const r = await tx.review.findFirstOrThrow({ where: { id } });
      if (r.status !== 'open') throw new ConflictException('This review is no longer open.');
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId } });
      const answers = this.checkAnswers('manager', await this.template(tx, org, cycle), { ...dto, overallRating: null }, false);
      await tx.reviewEntry.update({ where: { id: e.id }, data: { answers: asJson(answers), comment: dto.comment?.trim() || null, ...(submit ? { status: 'submitted', submittedAt: new Date() } : {}), version: { increment: 1 } } });
      if (submit) await audit(tx, c, 'perf.review.other_submitted', 'review', id, {});
    });
    return this.get(ctx, user, id);
  }

  /** PRF-13: what moved to me or away from me when a manager changed. */
  async handovers(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return this.run(ctx, async (tx, c) => {
      const org = c.organizationId;
      const me = await this.me(tx, org, v);
      if (!me) return [];
      const rows = await tx.perfOwnerTransfer.findMany({ where: { organizationId: org, OR: [{ oldManagerEmployeeId: me }, { newManagerEmployeeId: me }] }, orderBy: { createdAt: 'desc' }, take: 200 });
      const people = await this.names(tx, org, rows.flatMap((r) => [r.employeeId, r.oldManagerEmployeeId, r.newManagerEmployeeId]));
      return rows.map((r) => ({ id: r.id, employee: people.get(r.employeeId) ?? '', from: people.get(r.oldManagerEmployeeId ?? '') ?? '', to: people.get(r.newManagerEmployeeId ?? '') ?? '', direction: r.newManagerEmployeeId === me ? 'to_me' : 'from_me', artefactType: r.artefactType, artefactId: r.artefactId, effectiveOn: iso(r.effectiveOn), decisionNeeded: r.decisionNeeded }));
    });
  }

  // ------------------------------------------------------------------------------------------ reminders (PM-4.03)

  async sweep(today = todayIst()) {
    const SUPER = { organizationId: null, isSuperAdmin: true };
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ id: string }[]>`SELECT DISTINCT organization_id::text AS id FROM reviews WHERE status = 'open'`);
    for (const { id: org } of orgs) {
      try {
        await this.sweepOrg(org, today);
      } catch (e) {
        this.logger.warn(`review reminders ${org}: ${(e as Error).message}`);
      }
    }
  }

  /**
   * YX-PERF-06: two days before a stage is due its owner gets one reminder; the day after, one more goes to the owner
   * and to the owner's manager. reminded_on resets when the stage moves.
   */
  async sweepOrg(org: string, today = todayIst()) {
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    const sends = await this.tenantPrisma.forTenant(c, async (tx) => {
      const open = await tx.review.findMany({ where: { organizationId: org, status: 'open', stage: { in: ['self', 'manager'] } } });
      const cycles = new Map((await tx.reviewCycle.findMany({ where: { organizationId: org, id: { in: [...new Set(open.map((r) => r.cycleId))] } } })).map((x) => [x.id, x]));
      const soon: Review[] = [];
      const late: Review[] = [];
      for (const r of open) {
        const due = (cycles.get(r.cycleId)!.stages as StageIn[]).find((s) => s.key === r.stage)?.dueOn;
        if (!due) continue;
        const last = r.remindedOn ? iso(r.remindedOn) : null;
        if (today > due && (!last || last <= due)) late.push(r);
        else if (today <= due && today >= addDays(due, -2) && !last) soon.push(r);
      }
      const owner = (r: Review) => (r.stage === 'self' ? r.employeeId : r.managerEmployeeId);
      const lateOwners = late.map(owner);
      const above = lateOwners.length
        ? await tx.$queryRaw<{ mgr: string }[]>`SELECT a.manager_employee_id::text AS mgr FROM employee_assignments a WHERE a.organization_id = ${org}::uuid AND a.employee_id = ANY(${lateOwners}::uuid[]) AND a.superseded_at IS NULL AND a.manager_employee_id IS NOT NULL AND a.valid_from <= ${today}::date AND (a.valid_to IS NULL OR a.valid_to >= ${today}::date)`
        : [];
      const all = [...soon, ...late];
      if (all.length) await tx.review.updateMany({ where: { organizationId: org, id: { in: all.map((r) => r.id) } }, data: { remindedOn: asDate(today) } });
      const users = async (ids: string[]) => (await tx.employee.findMany({ where: { organizationId: org, id: { in: ids } }, select: { userId: true } })).map((e) => e.userId);
      return { soon: await users(soon.map(owner)), late: await users([...lateOwners, ...above.map((a) => a.mgr)]) };
    });
    await this.tell(org, sends.soon, 'perf.review.stage_due', 'A review you owe is due soon', '/yx/performance/reviews');
    await this.tell(org, sends.late, 'perf.review.stage_due', 'A review is overdue', '/yx/performance/reviews');
    return { soon: sends.soon.filter(Boolean).length, late: sends.late.filter(Boolean).length };
  }
}
