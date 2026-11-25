import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { ANY_ENTITY, jobsToday, ownEmployee } from './learning-core';

// LRN-12 (ported onto PR #210's sessions): once L&D confirms a session's attendance, each attendee rates it once (the
// session and the trainer, 1-5, and a comment); learning.check_after_days later (60 by default) their manager is asked
// once whether they apply what they learnt, and answers once per person. L&D and the trainer see the summary only.
const SUPER = { organizationId: null, isSuperAdmin: true } as const;
const ATTENDED = ['completed', 'failed'];

@Injectable()
export class LearningFeedbackService {
  private readonly logger = new Logger(LearningFeedbackService.name);
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private self(user: ScopeUser) {
    if (!user.userId || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves does this.');
  }

  private async titles(tx: Tx, c: CompanyContext, sessions: { id: string; courseId: string; trainerId: string }[]) {
    const courses = await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: sessions.map((s) => s.courseId) } }, select: { id: true, title: true } });
    const trainers = await tx.learningTrainer.findMany({ where: { organizationId: c.organizationId, id: { in: sessions.map((s) => s.trainerId) } }, select: { id: true, name: true, employeeId: true } });
    const staff = new Map((await jobsToday(tx, c, todayIst(), trainers.flatMap((t) => (t.employeeId ? [t.employeeId] : [])))).map((j) => [j.employeeId, j.name]));
    return {
      course: (id: string) => courses.find((x) => x.id === id)?.title ?? '',
      trainer: (id: string) => {
        const t = trainers.find((x) => x.id === id);
        return t?.name ?? (t?.employeeId ? staff.get(t.employeeId) : null) ?? 'the trainer';
      },
    };
  }

  /** The confirmed sessions I attended and have not rated yet. */
  due(ctx: TenantContext, user: ScopeUser) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      if (!me) return [];
      const mine = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, employeeId: me, sessionId: { not: null }, status: { in: ATTENDED } }, select: { id: true, sessionId: true } });
      const rated = new Set((await tx.learningFeedback.findMany({ where: { organizationId: c.organizationId, enrolmentId: { in: mine.map((m) => m.id) }, kind: 'reaction' }, select: { enrolmentId: true } })).map((f) => f.enrolmentId));
      const sessions = await tx.learningSession.findMany({ where: { organizationId: c.organizationId, id: { in: mine.filter((m) => !rated.has(m.id)).map((m) => m.sessionId!) }, attendanceConfirmedAt: { not: null } } });
      const t = await this.titles(tx, c, sessions);
      return sessions.map((s) => ({ sessionId: s.id, course: t.course(s.courseId), trainer: t.trainer(s.trainerId), venue: s.venue, confirmedOn: s.attendanceConfirmedAt!.toISOString().slice(0, 10) }));
    });
  }

  /** My reaction to a session I attended, once its attendance is confirmed; once. */
  react(ctx: TenantContext, user: ScopeUser, sessionId: string, dto: { overall: number; trainer: number; comment?: string }) {
    this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      const s = await tx.learningSession.findFirst({ where: { organizationId: c.organizationId, id: sessionId, attendanceConfirmedAt: { not: null } } });
      const e = me && s ? await tx.learningEnrolment.findFirst({ where: { organizationId: c.organizationId, sessionId, employeeId: me, status: { in: ATTENDED } } }) : null;
      if (!e) throw new NotFoundException('No such session to rate.');
      const made = await tx.learningFeedback.createMany({ data: [{ organizationId: c.organizationId, sessionId, enrolmentId: e.id, kind: 'reaction', byUserId: c.userId!, overall: dto.overall, trainer: dto.trainer, comment: dto.comment?.trim() || null }], skipDuplicates: true });
      if (!made.count) throw new ConflictException({ statusCode: 409, code: 'LEARNING_RATED', message: 'You rated this session already.' });
      await audit(tx, c, 'learning.session.rated', 'learning_session', sessionId, {});
      return { rated: true };
    });
  }

  /** The session's feedback summary (no names): for its page (L&D and the trainer). */
  async summary(tx: Tx, c: CompanyContext, sessionId: string) {
    const fb = await tx.learningFeedback.findMany({ where: { organizationId: c.organizationId, sessionId, kind: 'reaction' }, select: { overall: true, trainer: true, comment: true } });
    const avg = (k: 'overall' | 'trainer') => (fb.length ? Math.round((fb.reduce((a, f) => a + (f[k] ?? 0), 0) / fb.length) * 10) / 10 : null);
    return { responses: fb.length, overall: avg('overall'), trainer: avg('trainer'), comments: fb.map((f) => f.comment).filter((x): x is string => Boolean(x)) };
  }

  summaryOf(ctx: TenantContext, sessionId: string) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.summary(tx, c, sessionId));
  }

  private async afterDays(tx: Tx, c: CompanyContext) {
    return Number(await settingFor(tx, c, 'learning.check_after_days', ANY_ENTITY)) || 60;
  }

  /** My reports who completed a session at least the company's days ago and whom I have not checked yet. */
  checks(ctx: TenantContext, user: ScopeUser) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      if (!me || user.impersonatorUserId || user.actingSuperAdmin) return [];
      const before = new Date(Date.now() - (await this.afterDays(tx, c)) * 86_400_000);
      const sessions = await tx.learningSession.findMany({ where: { organizationId: c.organizationId, attendanceConfirmedAt: { not: null, lte: before } } });
      if (!sessions.length) return [];
      const done = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: { in: sessions.map((s) => s.id) }, status: 'completed' }, select: { id: true, sessionId: true, employeeId: true } });
      const team = new Map((await jobsToday(tx, c, todayIst(), done.map((d) => d.employeeId))).filter((j) => j.managerEmployeeId === me).map((j) => [j.employeeId, j.name]));
      const checked = new Set((await tx.learningFeedback.findMany({ where: { organizationId: c.organizationId, enrolmentId: { in: done.map((d) => d.id) }, kind: 'check' }, select: { enrolmentId: true } })).map((f) => f.enrolmentId));
      const t = await this.titles(tx, c, sessions);
      return done
        .filter((d) => team.has(d.employeeId) && !checked.has(d.id))
        .map((d) => {
          const s = sessions.find((x) => x.id === d.sessionId)!;
          return { enrolmentId: d.id, sessionId: s.id, person: team.get(d.employeeId)!, course: t.course(s.courseId), trainer: t.trainer(s.trainerId), completedOn: s.attendanceConfirmedAt!.toISOString().slice(0, 10) };
        });
    });
  }

  /** The manager's answer about one report, once. */
  async check(ctx: TenantContext, user: ScopeUser, enrolmentId: string, dto: { applying: 'yes' | 'partly' | 'no' | 'early'; comment?: string }) {
    this.self(user);
    const due = await this.checks(ctx, user);
    const row = due.find((d) => d.enrolmentId === enrolmentId);
    if (!row) throw new NotFoundException('No such training check.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const made = await tx.learningFeedback.createMany({ data: [{ organizationId: c.organizationId, sessionId: row.sessionId, enrolmentId, kind: 'check', byUserId: c.userId!, applying: dto.applying, comment: dto.comment?.trim() || null }], skipDuplicates: true });
      if (!made.count) throw new ConflictException('You answered this check already.');
      await audit(tx, c, 'learning.session.checked', 'learning_session', row.sessionId, { applying: dto.applying });
      return { checked: true };
    });
  }

  /** After attendance is confirmed: the attendees are asked to rate the session. */
  async askRatings(ctx: TenantContext, sessionId: string) {
    const users = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId, status: { in: ATTENDED } }, select: { employeeId: true } });
      return (await jobsToday(tx, c, todayIst(), e.map((x) => x.employeeId))).flatMap((j) => (j.userId ? [j.userId] : []));
    });
    await this.tell(ctx.organizationId!, users, 'learning.rate_session', sessionId, 'How was the training session? Rate it in a minute.', `/yx/learning/feedback/${sessionId}`);
  }

  /** Daily: managers of people who completed a session the company's days ago are asked once (per session). */
  async askChecks(): Promise<number> {
    const rows = await this.tenantPrisma.forTenant(SUPER, (tx) => tx.learningSession.findMany({ where: { attendanceConfirmedAt: { not: null }, checkSentAt: null }, orderBy: { attendanceConfirmedAt: 'asc' }, take: 200 }));
    let n = 0;
    for (const s of rows) {
      try {
        const managers = await inCompany(this.tenantPrisma, { organizationId: s.organizationId, isSuperAdmin: false }, async (tx, c) => {
          if (s.attendanceConfirmedAt!.getTime() > Date.now() - (await this.afterDays(tx, c)) * 86_400_000) return null;
          await tx.learningSession.update({ where: { id: s.id }, data: { checkSentAt: new Date() } });
          const done = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: s.id, status: 'completed' }, select: { employeeId: true } });
          const today = todayIst();
          const heads = (await jobsToday(tx, c, today, done.map((d) => d.employeeId))).flatMap((j) => (j.managerEmployeeId ? [j.managerEmployeeId] : []));
          return (await jobsToday(tx, c, today, heads)).flatMap((j) => (j.userId ? [j.userId] : []));
        });
        if (!managers?.length) continue;
        n++;
        await this.tell(s.organizationId, [...new Set(managers)], 'learning.training_check', s.id, 'Is your team applying what they learnt? A training check is waiting for you.', '/yx/learning/checks');
      } catch (e) {
        this.logger.error(`Training checks for session ${s.id} failed: ${(e as Error).message}`);
      }
    }
    return n;
  }

  private tell(org: string, to: string[], type: string, entityId: string, text: string, link: string) {
    if (!to.length) return Promise.resolve();
    return this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: 'learning_session', entityId, contextText: text, linkPath: link }, { subject: text, html: `<p>${text} Open YukthiX to answer.</p>` }).catch(() => undefined);
  }
}
