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
import type { CycleDto, EntryDto, OverrideDto } from './review-dto';

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

  private async access(tx: Tx, c: CompanyContext, v: Viewer, r: Review) {
    const me = await this.me(tx, c.organizationId, v);
    const today = todayIst();
    const own = me === r.employeeId;
    const manager = me === r.managerEmployeeId;
    const chain = !own && !manager && covers(started(await implicitPeriods(tx, c, me, r.employeeId), today), today);
    const scope = v.grants.has('perf.review.view') && covers(started(await grantPeriods(tx, c, v, 'perf.review.view', r.employeeId, me), today), today);
    return { me, own, manager, chain, scope };
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
      if (!a.own && !a.manager && !a.chain && !a.scope) throw new NotFoundException('No such review.');
      const cycle = await tx.reviewCycle.findFirstOrThrow({ where: { id: r.cycleId } });
      const tpl = await this.template(tx, org, cycle);
      const { t, sections, levels, bands } = tpl;
      const items = this.items(tpl);
      const goals = await tx.$queryRaw<{ id: string; title: string; progress: number; weight: number; status: string }[]>`
        SELECT g.id::text, g.title, g.progress::float8 AS progress, g.weight::float8 AS weight, g.status FROM goals g JOIN goal_periods p ON p.organization_id = g.organization_id AND p.id = g.period_id
        WHERE g.organization_id = ${org}::uuid AND g.owner_type = 'person' AND g.owner_employee_id = ${r.employeeId}::uuid AND g.status IN ('active', 'done')
          AND p.from_on <= ${cycle.periodTo} AND p.to_on >= ${cycle.periodFrom} ORDER BY g.weight DESC, g.title`;
      const entries = await tx.reviewEntry.findMany({ where: { organizationId: org, reviewId: id, stage: { in: ['self', 'manager'] } } });
      const self = entries.find((e) => e.stage === 'self') ?? null;
      const mgr = entries.find((e) => e.stage === 'manager') ?? null;
      const released = Boolean(r.releasedAt);
      const afterDraft = (await settingFor(tx, c, 'perf.self_review.visible_to_manager', { legalEntityId: r.legalEntityId })) === 'after_manager_draft';
      // Before release the employee sees only their own self review; the manager sees the submitted self review once they
      // have saved a draft of their own (anti-anchoring, §9.3); the chain above and HR in scope read both.
      const showSelf = a.own || ((a.manager || a.chain || a.scope) && self?.status === 'submitted' && (!a.manager || !afterDraft || Boolean(mgr)));
      const showManager = !a.own || released;
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
        role: a.own ? 'employee' : a.manager ? 'manager' : 'viewer',
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
        can: {
          self: a.own && open && r.stage === 'self' && self?.status !== 'submitted',
          manager: a.manager && open && (r.stage === 'self' || r.stage === 'manager') && mgr?.status !== 'submitted',
        },
        version: r.version,
      };
    });
  }

  /** What a stage answers: every question, and each rated section without questions as one rating of the whole section. */
  private items(tpl: Awaited<ReturnType<PerformanceReviewsService['template']>>) {
    return [
      ...tpl.questions.map((q) => ({ id: q.id, sectionId: q.sectionId, text: q.text, answer: q.answer, required: q.required, maxChars: q.maxChars })),
      ...tpl.sections.filter((s) => s.rated && !tpl.questions.some((q) => q.sectionId === s.id)).map((s) => ({ id: s.id, sectionId: s.id, text: s.title, answer: 'both', required: false, maxChars: 2000 })),
    ];
  }

  /** Checks one entry against the template: only the stage's questions, ratings on the scale, texts within their limit. */
  private checkAnswers(stage: StageKey, tpl: Awaited<ReturnType<PerformanceReviewsService['template']>>, dto: EntryDto, submit: boolean) {
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
