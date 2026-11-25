import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { holdersOf } from '../time/time-core';
import { NotificationsService } from '../notifications/notifications.service';
import { JobToday, LEARNING_KEYS, asDate, iso, jobsToday } from './learning-core';
import { ReminderKind, addDays, covers, reminderDue, ruleEnrols } from './learning-rules';

// LRN-07 Assignment rules: who must complete a course, by when, how often. A rule is checked when it is saved and
// every day (the daily check also enrols people who joined, transferred or changed role since: their job today is
// what counts). Reminders 7 and 2 days before the due date; the manager is told the day after it is missed, then the
// people with learning.report.view over the person after 7 days. Each reminder goes once per enrolment.

export interface RuleInput {
  name: string;
  courseId: string;
  legalEntityIds: string[];
  locationIds: string[];
  departmentIds: string[];
  designation?: string | null;
  dueDays: number;
  repeatMonths: 0 | 12 | 24;
  active: boolean;
}

const SUPER = { organizationId: null, isSuperAdmin: true };

@Injectable()
export class LearningAssignService {
  private readonly logger = new Logger(LearningAssignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async manager(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, LEARNING_KEYS);
    if (!tenantWide(v, 'learning.manage') || v.actingForOther) throw new ForbiddenException('Assignment rules need learning.manage.');
  }

  /** Every rule with its course, who it covers in words, and how many people match today. */
  async list(ctx: TenantContext, user: ScopeUser) {
    await this.manager(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rules = await tx.learningRule.findMany({ where: { organizationId: c.organizationId }, orderBy: { createdAt: 'asc' } });
      const today = todayIst();
      const jobs = await jobsToday(tx, c, today);
      const courses = await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: rules.map((r) => r.courseId) } }, select: { id: true, title: true } });
      const names = await this.placeNames(tx, c);
      return rules.map((r) => ({
        id: r.id,
        name: r.name,
        courseId: r.courseId,
        course: courses.find((x) => x.id === r.courseId)?.title ?? '',
        legalEntityIds: r.legalEntityIds,
        locationIds: r.locationIds,
        departmentIds: r.departmentIds,
        designation: r.designation,
        population: this.population(r, names),
        dueDays: r.dueDays,
        repeatMonths: r.repeatMonths,
        matches: jobs.filter((j) => covers(r, j)).length,
        active: r.active,
        version: r.version,
      }));
    });
  }

  private async placeNames(tx: Tx, c: CompanyContext) {
    const org = { organizationId: c.organizationId };
    const [entities, locations, departments] = await Promise.all([
      tx.legalEntity.findMany({ where: org, select: { id: true, name: true } }),
      tx.location.findMany({ where: org, select: { id: true, name: true } }),
      tx.department.findMany({ where: org, select: { id: true, name: true } }),
    ]);
    return new Map([...entities, ...locations, ...departments].map((x) => [x.id, x.name]));
  }

  /** "Hosur plant · Operations, Quality · designation has 'operator'" or "Everyone". */
  private population(r: { legalEntityIds: string[]; locationIds: string[]; departmentIds: string[]; designation: string | null }, names: Map<string, string>) {
    const part = (ids: string[]) => ids.map((id) => names.get(id) ?? 'Unknown').join(', ');
    const parts = [part(r.legalEntityIds), part(r.locationIds), part(r.departmentIds), r.designation ? `designation has "${r.designation}"` : ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Everyone';
  }

  /** What saving a rule would do today: who matches and who would be enrolled now. */
  async preview(ctx: TenantContext, user: ScopeUser, dto: RuleInput) {
    await this.manager(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.checkRule(tx, c, dto);
      const today = todayIst();
      const jobs = (await jobsToday(tx, c, today)).filter((j) => covers({ ...dto, designation: dto.designation ?? null }, j));
      const plan = await this.plan(tx, c, dto.courseId, dto, jobs, today);
      return { matches: jobs.length, toEnrol: plan.length, people: jobs.slice(0, 50).map((j) => j.name) };
    });
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: RuleInput) {
    await this.manager(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.checkRule(tx, c, dto);
      const rule = await tx.learningRule.create({ data: { organizationId: c.organizationId, ...this.data(dto), createdBy: c.userId ?? null } });
      await audit(tx, c, 'learning.rule.created', 'learning_rule', rule.id, { name: rule.name });
      const enrolled = rule.active ? await this.applyRule(tx, c, rule.id, todayIst()) : 0;
      return { id: rule.id, enrolled };
    });
  }

  async update(ctx: TenantContext, user: ScopeUser, ruleId: string, dto: RuleInput & { version: number }) {
    await this.manager(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      if (!(await tx.learningRule.count({ where: { organizationId: c.organizationId, id: ruleId } }))) throw new NotFoundException('No such rule.');
      await this.checkRule(tx, c, dto);
      const moved = await tx.learningRule.updateMany({ where: { organizationId: c.organizationId, id: ruleId, version: dto.version }, data: { ...this.data(dto), updatedAt: new Date(), version: { increment: 1 } } });
      if (!moved.count) throw new ConflictException('Someone else changed this rule. Reload it.');
      await audit(tx, c, 'learning.rule.updated', 'learning_rule', ruleId, { name: dto.name, active: dto.active });
      // Changing a rule never takes away enrolments already made; it enrols whoever newly matches.
      return { id: ruleId, enrolled: dto.active ? await this.applyRule(tx, c, ruleId, todayIst()) : 0 };
    });
  }

  private data(dto: RuleInput) {
    return { name: dto.name.trim(), courseId: dto.courseId, legalEntityIds: [...new Set(dto.legalEntityIds)], locationIds: [...new Set(dto.locationIds)], departmentIds: [...new Set(dto.departmentIds)], designation: dto.designation?.trim() || null, dueDays: dto.dueDays, repeatMonths: dto.repeatMonths, active: dto.active };
  }

  private async checkRule(tx: Tx, c: CompanyContext, dto: RuleInput) {
    const course = await tx.learningCourse.findFirst({ where: { organizationId: c.organizationId, id: dto.courseId }, select: { status: true } });
    if (!course) throw new BadRequestException('Choose a course of this company.');
    if (dto.active && course.status !== 'published') throw new BadRequestException('Publish the course before an active rule assigns it.');
    const org = { organizationId: c.organizationId };
    const [e, l, d] = await Promise.all([
      tx.legalEntity.count({ where: { ...org, id: { in: dto.legalEntityIds } } }),
      tx.location.count({ where: { ...org, id: { in: dto.locationIds } } }),
      tx.department.count({ where: { ...org, id: { in: dto.departmentIds } } }),
    ]);
    if (e !== new Set(dto.legalEntityIds).size || l !== new Set(dto.locationIds).size || d !== new Set(dto.departmentIds).size) throw new BadRequestException('Choose entities, locations and departments of this company.');
  }

  /** Who among `jobs` the rule enrols today, with the due date and whether it is a renewal. */
  private async plan(tx: Tx, c: CompanyContext, courseId: string, rule: { dueDays: number; repeatMonths: number }, jobs: JobToday[], today: string) {
    if (!jobs.length) return [];
    const ids = jobs.map((j) => j.employeeId);
    const enrolments = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, courseId, employeeId: { in: ids }, status: { in: ['requested', 'enrolled', 'in_progress', 'completed'] } }, select: { employeeId: true, status: true, completedAt: true } });
    return jobs.flatMap((j) => {
      const mine = enrolments.filter((x) => x.employeeId === j.employeeId);
      const open = mine.some((x) => x.status !== 'completed');
      const lastCompleted = mine.map((x) => iso(x.completedAt)).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null;
      const r = ruleEnrols({ today, dueDays: rule.dueDays, repeatMonths: rule.repeatMonths, open, lastCompleted });
      return r.enrol ? [{ employeeId: j.employeeId, dueOn: r.dueOn, renewal: r.renewal }] : [];
    });
  }

  /** Enrols whoever the rule covers and needs it today. Returns how many were enrolled. */
  private async applyRule(tx: Tx, c: CompanyContext, ruleId: string, today: string): Promise<number> {
    const rule = await tx.learningRule.findFirst({ where: { organizationId: c.organizationId, id: ruleId, active: true } });
    if (!rule) return 0;
    const course = await tx.learningCourse.findFirst({ where: { organizationId: c.organizationId, id: rule.courseId, status: 'published' }, select: { id: true } });
    if (!course) return 0;
    const jobs = (await jobsToday(tx, c, today)).filter((j) => covers(rule, j));
    const plan = await this.plan(tx, c, rule.courseId, rule, jobs, today);
    if (!plan.length) return 0;
    const made = await tx.learningEnrolment.createMany({
      data: plan.map((p) => ({ organizationId: c.organizationId, employeeId: p.employeeId, courseId: rule.courseId, source: p.renewal ? 'renewal' : 'rule', ruleId: rule.id, assignedOn: asDate(today), dueOn: asDate(p.dueOn), status: 'enrolled' })),
      skipDuplicates: true,
    });
    if (made.count) await audit(tx, c, 'learning.rule.applied', 'learning_rule', rule.id, { enrolled: made.count });
    return made.count;
  }

  /** The daily check: every company's active rules, then the reminders. */
  async sweep(): Promise<{ enrolled: number; reminded: number }> {
    const today = todayIst();
    const orgs = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.learningRule.findMany({ where: { active: true }, distinct: ['organizationId'], select: { organizationId: true } }));
    let enrolled = 0;
    for (const { organizationId } of orgs) {
      try {
        enrolled += await inCompany(this.tenantPrisma, { organizationId, isSuperAdmin: false }, async (tx, c) => {
          let n = 0;
          for (const r of await tx.learningRule.findMany({ where: { organizationId, active: true }, select: { id: true } })) n += await this.applyRule(tx, c, r.id, today);
          return n;
        });
      } catch (e) {
        this.logger.error(`Learning rules for ${organizationId} failed: ${(e as Error).message}`);
      }
    }
    const reminded = await this.remind(today);
    if (enrolled || reminded) this.logger.log(`Learning: ${enrolled} enrolled by rules, ${reminded} reminders sent`);
    return { enrolled, reminded };
  }

  /** Reminders due today, in every company; each kind once per enrolment. */
  async remind(today: string, only?: { organizationId: string; enrolmentIds: string[] }): Promise<number> {
    const open = await this.tenantPrisma.forTenant(SUPER, (tx) =>
      tx.learningEnrolment.findMany({
        where: { status: { in: ['enrolled', 'in_progress'] }, dueOn: { not: null, lte: asDate(addDays(today, 7)) }, ...(only ? { organizationId: only.organizationId, id: { in: only.enrolmentIds } } : {}) },
        select: { id: true, organizationId: true, employeeId: true, courseId: true, dueOn: true },
        take: 5000,
      }),
    );
    let sent = 0;
    for (const org of [...new Set(open.map((o) => o.organizationId))]) {
      try {
        sent += await this.remindIn(org, open.filter((o) => o.organizationId === org), today);
      } catch (e) {
        this.logger.error(`Learning reminders for ${org} failed: ${(e as Error).message}`);
      }
    }
    return sent;
  }

  private async remindIn(organizationId: string, open: { id: string; employeeId: string; courseId: string; dueOn: Date | null }[], today: string): Promise<number> {
    const ctx = { organizationId, isSuperAdmin: false };
    const out: { to: string[]; kind: ReminderKind; course: string; name: string; due: string; enrolmentId: string; about: string | null }[] = [];
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const sentBefore = await tx.learningReminder.findMany({ where: { organizationId, enrolmentId: { in: open.map((o) => o.id) } } });
      const jobs = new Map((await jobsToday(tx, c, today, open.map((o) => o.employeeId))).map((j) => [j.employeeId, j]));
      const managers = new Map((await jobsToday(tx, c, today, [...jobs.values()].flatMap((j) => (j.managerEmployeeId ? [j.managerEmployeeId] : [])))).map((j) => [j.employeeId, j]));
      const courses = new Map((await tx.learningCourse.findMany({ where: { organizationId, id: { in: [...new Set(open.map((o) => o.courseId))] } }, select: { id: true, title: true } })).map((x) => [x.id, x.title]));
      for (const e of open) {
        const kind = reminderDue(iso(e.dueOn)!, today);
        const job = jobs.get(e.employeeId);
        if (!kind || !job || sentBefore.some((s) => s.enrolmentId === e.id && s.kind === kind)) continue;
        const to =
          kind === 'overdue_manager'
            ? [managers.get(job.managerEmployeeId ?? '')?.userId].filter((x): x is string => Boolean(x))
            : kind === 'overdue_hr'
              ? (await holdersOf(tx, organizationId, 'learning.report.view', e.employeeId, today)).filter((u) => u !== job.userId)
              : [job.userId].filter((x): x is string => Boolean(x));
        await tx.learningReminder.create({ data: { organizationId, enrolmentId: e.id, kind } });
        if (to.length) out.push({ to, kind, course: courses.get(e.courseId) ?? 'a course', name: job.name, due: iso(e.dueOn)!, enrolmentId: e.id, about: job.userId });
      }
    });
    // Sent after the commit, so a failed mail never undoes the record that it was due.
    for (const m of out) {
      const due = new Date(`${m.due}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
      const text = m.kind === 'before_7' || m.kind === 'before_2' ? `${m.course} is due on ${due}` : `${m.name} has not completed ${m.course} (due ${due})`;
      const link = m.kind === 'before_7' || m.kind === 'before_2' ? `/yx/learning/enrolments/${m.enrolmentId}` : m.kind === 'overdue_manager' ? '/yx/learning/team' : '/yx/learning/compliance';
      await this.notifications.notifySystem(ctx, m.to, `learning.${m.kind}`, { entityType: 'learning', entityId: m.enrolmentId, contextText: text, linkPath: link }, { subject: text, html: `<p>${text}. Open YukthiX to see it.</p>` }, m.kind.startsWith('overdue') ? m.about : null).catch(() => undefined);
    }
    return out.length;
  }

  /** "Remind overdue" on the compliance page: the learners in the given list who are past due, once a day each. */
  async remindNow(ctx: TenantContext, enrolmentIds: string[]) {
    const today = todayIst();
    const due = await inCompany(this.tenantPrisma, ctx, (tx, c) =>
      tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, id: { in: enrolmentIds }, status: { in: ['enrolled', 'in_progress'] }, dueOn: { lt: asDate(today) } }, select: { id: true, employeeId: true, courseId: true, dueOn: true } }),
    );
    if (!due.length) return 0;
    const out: { to: string; text: string; id: string }[] = [];
    await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const jobs = new Map((await jobsToday(tx, c, today, due.map((d) => d.employeeId))).map((j) => [j.employeeId, j]));
      const courses = new Map((await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: due.map((d) => d.courseId) } }, select: { id: true, title: true } })).map((x) => [x.id, x.title]));
      for (const d of due) {
        const user = jobs.get(d.employeeId)?.userId;
        if (user) out.push({ to: user, id: d.id, text: `${courses.get(d.courseId)} was due on ${new Date(d.dueOn!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}. Please complete it.` });
      }
      await audit(tx, c, 'learning.overdue.reminded', 'organization', c.organizationId, { people: out.length });
    });
    for (const m of out) await this.notifications.notifySystem(ctx, [m.to], 'learning.overdue', { entityType: 'learning', entityId: m.id, contextText: m.text, linkPath: `/yx/learning/enrolments/${m.id}` }, { subject: m.text, html: `<p>${m.text}</p>` }).catch(() => undefined);
    return out.length;
  }
}
