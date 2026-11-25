import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, has, implicitSql, inEntitySql, inScopeSql } from '../access/scope';
import { JobToday, LEARNING_KEYS, iso, jobsToday, ownEmployee } from './learning-core';
import { addDays, progressPct, shownStatus, validOn } from './learning-rules';
import { LearningAssignService } from './learning-assign.service';

// LRN-08 Compliance dashboard (learning.report.view, people in scope): mandatory courses by department, the share of
// assigned people with a valid completion (an expired certificate is not valid), who is overdue, what expires in 30
// days, the audit export and "Remind overdue". The manager's team view is the same for their team (the implicit view).
// The person's Learning tab on their record (PPL-03): themselves, their manager, or learning.report.view.

type Enrol = { id: string; employeeId: string; courseId: string; status: string; dueOn: Date | null; completedAt: Date | null };
type Cert = { employeeId: string; courseId: string; issuedOn: Date; expiresOn: Date | null };

@Injectable()
export class LearningReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly assign: LearningAssignService,
  ) {}

  private async reporter(user: ScopeUser): Promise<Viewer> {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, LEARNING_KEYS);
    if (!has(v, 'learning.report.view') || v.actingForOther) throw new ForbiddenException('Training reports need learning.report.view.');
    return v;
  }

  /** People in the report's scope today (learning.report.view), optionally in one legal entity. */
  private async inScope(tx: Tx, c: CompanyContext, v: Viewer, today: string, entityId: string | null): Promise<JobToday[]> {
    const me = await ownEmployee(tx, c);
    const ids = await tx.$queryRaw<{ id: string }[]>`
      SELECT e.id::text FROM employees e WHERE e.organization_id = ${c.organizationId}::uuid
        AND ${inScopeSql(c, v, 'learning.report.view', Prisma.sql`e.id`, Prisma.sql`${today}::date`, me)}
        AND ${inEntitySql(c, entityId, Prisma.sql`e.id`, Prisma.sql`${today}::date`)}`;
    return jobsToday(tx, c, today, ids.map((r) => r.id));
  }

  /** Each person × course: the shown status, or a valid completion. */
  private async state(tx: Tx, c: CompanyContext, people: JobToday[], courseIds: string[] | null) {
    const ids = people.map((p) => p.employeeId);
    const where = { organizationId: c.organizationId, employeeId: { in: ids }, ...(courseIds ? { courseId: { in: courseIds } } : {}) };
    const enrolments: Enrol[] = ids.length ? await tx.learningEnrolment.findMany({ where: { ...where, status: { in: ['enrolled', 'in_progress', 'completed'] } }, select: { id: true, employeeId: true, courseId: true, status: true, dueOn: true, completedAt: true }, orderBy: { createdAt: 'asc' } }) : [];
    const certs: Cert[] = ids.length ? await tx.learningCertificate.findMany({ where, select: { employeeId: true, courseId: true, issuedOn: true, expiresOn: true }, orderBy: { issuedOn: 'asc' } }) : [];
    return { enrolments, certs };
  }

  /** Compliant for one person and course: the latest completion is still valid (its certificate has not expired). */
  private valid(s: { enrolments: Enrol[]; certs: Cert[] }, employeeId: string, courseId: string, today: string) {
    const done = s.enrolments.filter((e) => e.employeeId === employeeId && e.courseId === courseId && e.completedAt).at(-1);
    if (!done) return false;
    const cert = s.certs.filter((x) => x.employeeId === employeeId && x.courseId === courseId).at(-1);
    return validOn(iso(done.completedAt), cert ? iso(cert.expiresOn) : null, today);
  }

  private async mandatory(tx: Tx, c: CompanyContext) {
    return tx.learningCourse.findMany({ where: { organizationId: c.organizationId, status: 'published', mandatory: true }, orderBy: { title: 'asc' }, select: { id: true, title: true } });
  }

  /** LRN-08 for L&D and HR. */
  async compliance(ctx: TenantContext, user: ScopeUser, entityId: string | null) {
    const v = await this.reporter(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const people = await this.inScope(tx, c, v, today, entityId);
      const courses = await this.mandatory(tx, c);
      const s = await this.state(tx, c, people, courses.map((x) => x.id));
      const depts = [...new Set(people.map((p) => p.department))].sort();
      const rows = depts.map((dept) => {
        const inDept = people.filter((p) => p.department === dept);
        const assigned = courses.map((course) => inDept.filter((p) => s.enrolments.some((e) => e.employeeId === p.employeeId && e.courseId === course.id)).length);
        const done = courses.map((course) => inDept.filter((p) => this.valid(s, p.employeeId, course.id, today)).length);
        return { dept, done, assigned, size: inDept.length };
      });
      const overdue = await this.overdue(tx, c, people, today);
      const soon = addDays(today, 30);
      const latest = new Map<string, Cert>();
      for (const x of s.certs) latest.set(`${x.employeeId}:${x.courseId}`, x);
      const expiring = [...latest.values()].filter((x) => x.expiresOn && iso(x.expiresOn)! >= today && iso(x.expiresOn)! <= soon).length;
      const rules = await tx.learningRule.count({ where: { organizationId: c.organizationId, active: true } });
      await audit(tx, c, 'learning.report.viewed', 'organization', c.organizationId, { report: 'compliance', entityId });
      return { today, courses: courses.map((x) => x.title), rows, overdue, expiring, rules };
    });
  }

  private async overdue(tx: Tx, c: CompanyContext, people: JobToday[], today: string) {
    if (!people.length) return [];
    const rows = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, employeeId: { in: people.map((p) => p.employeeId) }, status: { in: ['enrolled', 'in_progress'] }, dueOn: { lt: new Date(`${today}T00:00:00Z`) } }, orderBy: { dueOn: 'asc' }, take: 500 });
    const courses = new Map((await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.map((r) => r.courseId))] } }, select: { id: true, title: true } })).map((x) => [x.id, x.title]));
    const byId = new Map(people.map((p) => [p.employeeId, p]));
    const managers = new Map((await jobsToday(tx, c, today, people.flatMap((p) => (p.managerEmployeeId ? [p.managerEmployeeId] : [])))).map((j) => [j.employeeId, j.name]));
    return rows.map((r) => {
      const p = byId.get(r.employeeId)!;
      return { id: r.id, employeeId: r.employeeId, name: p.name, dept: p.department, course: courses.get(r.courseId) ?? '', due: iso(r.dueOn)!, manager: managers.get(p.managerEmployeeId ?? '') ?? '' };
    });
  }

  /** "Remind overdue": everyone overdue in the reader's scope (and entity), once each. */
  async remindOverdue(ctx: TenantContext, user: ScopeUser, entityId: string | null) {
    const v = await this.reporter(user);
    const ids = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      return (await this.overdue(tx, c, await this.inScope(tx, c, v, today, entityId), today)).map((o) => o.id);
    });
    return { reminded: await this.assign.remindNow(ctx, ids) };
  }

  /** The audit export: every assignment of a mandatory course for people in scope, with its state. */
  async exportCsv(ctx: TenantContext, user: ScopeUser, entityId: string | null): Promise<string> {
    const v = await this.reporter(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      const people = await this.inScope(tx, c, v, today, entityId);
      const courses = await this.mandatory(tx, c);
      const s = await this.state(tx, c, people, courses.map((x) => x.id));
      const lines: string[][] = [['Employee', 'Department', 'Designation', 'Course', 'Status', 'Due', 'Completed', 'Certificate valid until']];
      for (const p of people)
        for (const course of courses) {
          const mine = s.enrolments.filter((e) => e.employeeId === p.employeeId && e.courseId === course.id);
          if (!mine.length) continue;
          const last = mine.at(-1)!;
          const cert = s.certs.filter((x) => x.employeeId === p.employeeId && x.courseId === course.id).at(-1);
          const status = this.valid(s, p.employeeId, course.id, today) ? 'Compliant' : last.status === 'completed' ? 'Expired' : shownStatus({ status: last.status, dueOn: iso(last.dueOn) }, today);
          lines.push([p.name, p.department, p.designation, course.title, status, iso(last.dueOn) ?? '', iso(mine.filter((e) => e.completedAt).at(-1)?.completedAt) ?? '', iso(cert?.expiresOn) ?? '']);
        }
      await audit(tx, c, 'learning.report.exported', 'organization', c.organizationId, { rows: lines.length - 1, entityId });
      return `﻿${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n`;
    });
  }

  /** The manager's team: each person × mandatory course with a status word, and who is overdue. */
  async team(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      if (!me) throw new ForbiddenException('Only people with a team see it.');
      const today = todayIst();
      const ids = await tx.$queryRaw<{ id: string }[]>`
        SELECT e.id::text FROM employees e WHERE e.organization_id = ${c.organizationId}::uuid AND e.id <> ${me}::uuid
          AND ${await implicitSql(tx, c, me, Prisma.sql`e.id`, Prisma.sql`${today}::date`)}`;
      const people = await jobsToday(tx, c, today, ids.map((r) => r.id));
      const courses = await this.mandatory(tx, c);
      const s = await this.state(tx, c, people, courses.map((x) => x.id));
      const word = (p: JobToday, courseId: string) => {
        if (this.valid(s, p.employeeId, courseId, today)) return 'Completed';
        const mine = s.enrolments.filter((e) => e.employeeId === p.employeeId && e.courseId === courseId);
        if (!mine.length) return 'Not assigned';
        const last = mine.at(-1)!;
        return last.status === 'completed' ? 'Expired' : shownStatus({ status: last.status, dueOn: iso(last.dueOn) }, today);
      };
      return {
        today,
        courses: courses.map((x) => x.title),
        people: people.sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ employeeId: p.employeeId, name: p.name, role: p.designation, cells: courses.map((x) => word(p, x.id)) })),
        overdue: await this.overdue(tx, c, people, today),
      };
    });
  }

  /** PPL-03 Learning tab: the person, their manager (team view) or learning.report.view over them. */
  async person(ctx: TenantContext, user: ScopeUser, employeeId: string) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, LEARNING_KEYS);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const today = todayIst();
      if (!(await tx.employee.count({ where: { organizationId: c.organizationId, id: employeeId } }))) throw new NotFoundException('Not found');
      const me = await ownEmployee(tx, c);
      if (me !== employeeId) {
        const [row] = await tx.$queryRaw<{ ok: boolean }[]>`SELECT (${has(v, 'learning.report.view') && !v.actingForOther ? inScopeSql(c, v, 'learning.report.view', Prisma.sql`${employeeId}::uuid`, Prisma.sql`${today}::date`, me) : Prisma.sql`FALSE`}) OR (${await implicitSql(tx, c, me, Prisma.sql`${employeeId}::uuid`, Prisma.sql`${today}::date`)}) AS ok`;
        if (!row?.ok) throw new NotFoundException('Not found');
      }
      const rows = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, employeeId, status: { in: ['requested', 'enrolled', 'in_progress', 'completed'] } }, orderBy: [{ completedAt: 'desc' }, { dueOn: 'asc' }] });
      const courses = new Map((await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.map((r) => r.courseId))] } }, select: { id: true, title: true } })).map((x) => [x.id, x.title]));
      const certs = await tx.learningCertificate.findMany({ where: { organizationId: c.organizationId, employeeId, enrolmentId: { in: rows.map((r) => r.id) } } });
      const items = await tx.learningCourseItem.findMany({ where: { organizationId: c.organizationId, courseId: { in: [...courses.keys()] }, required: true }, select: { id: true, courseId: true } });
      const progress = await tx.learningItemProgress.findMany({ where: { organizationId: c.organizationId, enrolmentId: { in: rows.map((r) => r.id) } }, select: { enrolmentId: true, itemId: true } });
      // One line per course: the latest enrolment (a renewal replaces the completion it renews).
      const seen = new Set<string>();
      return rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .filter((r) => !seen.has(r.courseId) && Boolean(seen.add(r.courseId)))
        .map((r) => {
          const cert = certs.find((x) => x.enrolmentId === r.id);
          const req = items.filter((i) => i.courseId === r.courseId);
          return {
            id: r.id,
            course: courses.get(r.courseId) ?? '',
            status: shownStatus({ status: r.status, dueOn: iso(r.dueOn) }, today),
            due: iso(r.dueOn),
            completed: iso(r.completedAt),
            validUntil: iso(cert?.expiresOn),
            certificateId: cert?.id ?? null,
            progress: progressPct(progress.filter((p) => p.enrolmentId === r.id && req.some((i) => i.id === p.itemId)).length, req.length),
          };
        });
    });
  }
}

/** A CSV cell; text that starts like a formula is written as text, so a spreadsheet never runs it. */
function cell(s: string) {
  const t = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}
