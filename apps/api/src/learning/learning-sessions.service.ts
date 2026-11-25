import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, implicitSql, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { LEARNING_KEYS, asDate, jobsToday, ownEmployee } from './learning-core';
import { CODE_SECONDS, SEAT_STATUSES, codeWindow, secondsLeft, sessionResult, sixDigits } from './session-rules';
import { LearningService } from './learning.service';
import { placeInSession } from './session-place';

// Sessions (LRN-04): L&D (learning.manage) keeps the trainers and schedules sessions of classroom and virtual courses:
// dated slots, seats, a trainer, a venue or link, cost lines. People hold a seat or a waitlist place (first come, first
// served; a withdrawal moves the next person up and tells them). Nominations (LRN-06): L&D nominates anyone, a manager
// their team; a nominee may decline with a reason unless the course is mandatory. Attendance (LRN-05): per slot, by the
// rotating check-in code (QR or typed at a kiosk) or marked by hand by the trainer or L&D; once L&D confirms it, each
// result follows from the course's attendance share (an absent attendee is never completed) and completions get their
// certificate. An internal trainer (an employee) sees and marks their own sessions.

export interface SessionInput {
  courseId: string;
  mode: 'classroom' | 'virtual';
  venue: string;
  trainerId: string;
  seats: number;
  slots: { startsAt: string; endsAt: string }[];
  costLines: { label: string; amount: number }[];
}

type Session = Prisma.LearningSessionGetPayload<object>;
const OPEN = ['enrolled', 'in_progress', 'waitlisted'];
type Notice = { org: string; to: string[]; type: string; text: string; link: string };
const dayText = (d: Date) => d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

@Injectable()
export class LearningSessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly crypto: OrgSecretsCryptoService,
    private readonly notifications: NotificationsService,
    private readonly learning: LearningService,
  ) {}

  private viewer(user: ScopeUser) {
    return buildViewer(this.prisma, this.tenantPrisma, user, LEARNING_KEYS);
  }

  private ld(v: Viewer) {
    return tenantWide(v, 'learning.manage') && !v.actingForOther;
  }

  private need(v: Viewer) {
    if (!this.ld(v)) throw new ForbiddenException('Sessions and trainers need learning.manage.');
  }

  /** L&D, or the session's own internal trainer. */
  private async canRun(tx: Tx, c: CompanyContext, v: Viewer, s: Session) {
    if (this.ld(v)) return true;
    const me = await ownEmployee(tx, c);
    if (!me || v.actingForOther) return false;
    return Boolean(await tx.learningTrainer.count({ where: { organizationId: c.organizationId, id: s.trainerId, employeeId: me } }));
  }

  private async session(tx: Tx, c: CompanyContext, id: string) {
    const s = await tx.learningSession.findFirst({ where: { organizationId: c.organizationId, id } });
    if (!s) throw new NotFoundException('No such session.');
    return s;
  }

  private async lock(tx: Tx, sessionId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`learning-session:${sessionId}`}))`;
  }

  /** Notices go out after the transaction commits. */
  private async send(notices: (Notice | null)[]) {
    for (const n of notices) if (n) await this.tell(n.org, n.to, n.type, n.text, n.link);
  }

  private tell(org: string, to: string[], type: string, text: string, link: string) {
    if (!to.length) return Promise.resolve();
    return this.notifications.notifySystem({ organizationId: org, isSuperAdmin: false }, to, type, { entityType: 'learning', entityId: org, contextText: text, linkPath: link }, { subject: text, html: `<p>${text}. Open YukthiX to see it.</p>` }).catch(() => undefined);
  }

  // ------------------------------------------------------------------------------------------ trainers

  async trainers(ctx: TenantContext, user: ScopeUser) {
    this.need(await this.viewer(user));
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.learningTrainer.findMany({ where: { organizationId: c.organizationId }, orderBy: { name: 'asc' } });
      const sessions = await tx.learningSession.findMany({ where: { organizationId: c.organizationId, trainerId: { in: rows.map((r) => r.id) }, status: { not: 'cancelled' } }, select: { trainerId: true } });
      return rows.map((r) => ({ id: r.id, name: r.name, org: r.orgName ?? (r.external ? '' : 'Employee'), external: r.external, sessions: sessions.filter((s) => s.trainerId === r.id).length, score: null as number | null, accessEnds: null as string | null }));
    });
  }

  /** An internal trainer is an employee; an external one is a name and their training company. */
  async addTrainer(ctx: TenantContext, user: ScopeUser, dto: { external: boolean; employeeId?: string | null; name?: string | null; orgName?: string | null; email?: string | null }) {
    this.need(await this.viewer(user));
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      let name = dto.name?.trim() ?? '';
      if (!dto.external) {
        const e = dto.employeeId ? (await jobsToday(tx, c, todayIst(), [dto.employeeId]))[0] : null;
        if (!e) throw new BadRequestException('Choose an employee who works here today.');
        name = e.name;
      } else if (name.length < 2 || !dto.orgName?.trim()) throw new BadRequestException('Give the trainer’s name and their training company.');
      try {
        const t = await tx.learningTrainer.create({ data: { organizationId: c.organizationId, name, orgName: dto.external ? dto.orgName!.trim() : null, external: dto.external, employeeId: dto.external ? null : dto.employeeId!, email: dto.email?.trim() || null, createdBy: c.userId ?? null } });
        await audit(tx, c, 'learning.trainer.added', 'learning_trainer', t.id, { name, external: dto.external });
        return { id: t.id };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`${name} is a trainer already.`);
        throw e;
      }
    });
  }

  // ------------------------------------------------------------------------------------------ sessions

  /** L&D: every session; an internal trainer: their own. */
  async list(ctx: TenantContext, user: ScopeUser) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      let where: Prisma.LearningSessionWhereInput = { organizationId: c.organizationId };
      if (!this.ld(v)) {
        const me = await ownEmployee(tx, c);
        const mine = me && !v.actingForOther ? await tx.learningTrainer.findFirst({ where: { organizationId: c.organizationId, employeeId: me } }) : null;
        if (!mine) throw new ForbiddenException('Sessions are for L&D and trainers.');
        where = { ...where, trainerId: mine.id };
      }
      const rows = await tx.learningSession.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
      return this.rows(tx, c, rows);
    });
  }

  private async rows(tx: Tx, c: CompanyContext, rows: Session[]) {
    const ids = rows.map((r) => r.id);
    const [slots, courses, trainers, enrols] = await Promise.all([
      tx.learningSessionSlot.findMany({ where: { organizationId: c.organizationId, sessionId: { in: ids } }, orderBy: { position: 'asc' } }),
      tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.courseId) } }, select: { id: true, title: true } }),
      tx.learningTrainer.findMany({ where: { organizationId: c.organizationId, id: { in: rows.map((r) => r.trainerId) } } }),
      tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: { in: ids }, status: { in: [...SEAT_STATUSES, 'waitlisted'] } }, select: { sessionId: true, status: true } }),
    ]);
    const now = Date.now();
    return rows.map((r) => {
      const mine = slots.filter((x) => x.sessionId === r.id);
      const t = trainers.find((x) => x.id === r.trainerId);
      const started = mine.length && mine[0].startsAt.getTime() <= now;
      return {
        id: r.id,
        course: courses.find((x) => x.id === r.courseId)?.title ?? '',
        start: mine[0]?.startsAt.toISOString() ?? null,
        mode: r.mode === 'virtual' ? 'Virtual' : 'Classroom',
        venue: r.venue,
        trainer: t?.name ?? '',
        external: Boolean(t?.external),
        seats: r.seats,
        enrolled: enrols.filter((e) => e.sessionId === r.id && e.status !== 'waitlisted').length,
        waitlist: enrols.filter((e) => e.sessionId === r.id && e.status === 'waitlisted').length,
        status: r.status === 'cancelled' ? 'Cancelled' : r.status === 'completed' ? 'Completed' : started ? 'In progress' : 'Scheduled',
        cost: (r.costLines as { amount: number }[]).reduce((a, x) => a + Number(x.amount), 0),
      };
    });
  }

  async create(ctx: TenantContext, user: ScopeUser, dto: SessionInput) {
    this.need(await this.viewer(user));
    this.checkSlots(dto.slots);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await tx.learningCourse.findFirst({ where: { organizationId: c.organizationId, id: dto.courseId, status: 'published' } });
      if (!course || (course.type !== 'classroom' && course.type !== 'virtual')) throw new BadRequestException('Choose a published classroom or virtual course.');
      if (!(await tx.learningTrainer.count({ where: { organizationId: c.organizationId, id: dto.trainerId } }))) throw new BadRequestException('Choose a trainer of this company.');
      const s = await tx.learningSession.create({ data: { organizationId: c.organizationId, courseId: dto.courseId, mode: dto.mode, venue: dto.venue.trim(), trainerId: dto.trainerId, seats: dto.seats, costLines: dto.costLines, createdBy: c.userId ?? null } });
      await tx.learningSessionSlot.createMany({ data: dto.slots.map((x, i) => ({ organizationId: c.organizationId, sessionId: s.id, position: i + 1, startsAt: new Date(x.startsAt), endsAt: new Date(x.endsAt) })) });
      await audit(tx, c, 'learning.session.scheduled', 'learning_session', s.id, { course: course.title, slots: dto.slots.length, seats: dto.seats });
      return { id: s.id };
    });
  }

  private checkSlots(slots: SessionInput['slots']) {
    if (!slots.length) throw new BadRequestException('Add at least one slot.');
    for (const x of slots) if (!(Date.parse(x.endsAt) > Date.parse(x.startsAt))) throw new BadRequestException('Each slot ends after it starts.');
    const sorted = [...slots].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
    if (sorted.some((x, i) => x !== slots[i])) throw new BadRequestException('Put the slots in time order.');
  }

  /** The session page: attendees, waitlist, attendance by slot, results and cost (LRN-04). */
  async page(ctx: TenantContext, user: ScopeUser, id: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c, id);
      if (!(await this.canRun(tx, c, v, s))) throw new NotFoundException('No such session.');
      const [row] = await this.rows(tx, c, [s]);
      const slots = await tx.learningSessionSlot.findMany({ where: { organizationId: c.organizationId, sessionId: id }, orderBy: { position: 'asc' } });
      const enrols = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: id, status: { in: [...SEAT_STATUSES, 'waitlisted'] } }, orderBy: [{ waitlistedAt: 'asc' }, { createdAt: 'asc' }] });
      const people = new Map((await jobsToday(tx, c, todayIst(), enrols.map((e) => e.employeeId))).map((j) => [j.employeeId, j.name]));
      const marks = await tx.learningAttendance.findMany({ where: { organizationId: c.organizationId, slotId: { in: slots.map((x) => x.id) } } });
      const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: s.courseId }, select: { attendancePct: true, mandatory: true } });
      const seated = enrols.filter((e) => e.status !== 'waitlisted');
      const WORD: Record<string, 'Present' | 'Late' | 'Absent'> = { present: 'Present', late: 'Late', absent: 'Absent' };
      const METHOD: Record<string, string> = { qr: 'QR', code: 'Kiosk code', manual: 'Marked by hand' };
      return {
        session: { ...row, slots: slots.map((x) => ({ id: x.id, label: `${dayText(x.startsAt)}`, startsAt: x.startsAt.toISOString(), endsAt: x.endsAt.toISOString(), closed: Boolean(x.checkinClosedAt) })), version: s.version, attendancePct: course.attendancePct, mandatory: course.mandatory, ld: this.ld(v), confirmed: Boolean(s.attendanceConfirmedAt) },
        enrolled: seated.map((e) => ({ enrolmentId: e.id, employeeId: e.employeeId, name: people.get(e.employeeId) ?? '', source: e.source })),
        waitlist: enrols.filter((e) => e.status === 'waitlisted').map((e) => ({ enrolmentId: e.id, employeeId: e.employeeId, name: people.get(e.employeeId) ?? '' })),
        attendance: seated.map((e) => {
          const mine = slots.map((x) => marks.find((m) => m.slotId === x.id && m.enrolmentId === e.id));
          const how = [...new Set(mine.filter(Boolean).map((m) => METHOD[m!.method]))].join(', ');
          return { enrolmentId: e.id, name: people.get(e.employeeId) ?? '', marks: mine.map((m) => (m ? WORD[m.status] : null)), method: how || 'Not marked' };
        }),
        results: s.attendanceConfirmedAt ? seated.map((e) => ({ name: people.get(e.employeeId) ?? '', status: e.status === 'completed' ? 'Completed' : e.status === 'no_show' ? 'No-show' : e.status === 'failed' ? 'Not completed' : 'Pending', reason: e.resultReason ?? '' })) : [],
        costLines: s.costLines as { label: string; amount: number }[],
      };
    });
  }

  /** Reschedule (slots, venue, trainer, seats), the cost lines, or cancel; everyone with a place is told. */
  async update(ctx: TenantContext, user: ScopeUser, id: string, dto: Partial<Omit<SessionInput, 'courseId'>> & { cancel?: boolean; version: number }) {
    this.need(await this.viewer(user));
    if (dto.slots) this.checkSlots(dto.slots);
    const notices: (Notice | null)[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c, id);
      if (s.status !== 'scheduled') throw new ConflictException('This session is over or cancelled.');
      if (dto.trainerId && !(await tx.learningTrainer.count({ where: { organizationId: c.organizationId, id: dto.trainerId } }))) throw new BadRequestException('Choose a trainer of this company.');
      const moved = await tx.learningSession.updateMany({
        where: { id, version: dto.version },
        data: { ...(dto.venue ? { venue: dto.venue.trim() } : {}), ...(dto.mode ? { mode: dto.mode } : {}), ...(dto.trainerId ? { trainerId: dto.trainerId } : {}), ...(dto.seats ? { seats: dto.seats } : {}), ...(dto.costLines ? { costLines: dto.costLines } : {}), ...(dto.cancel ? { status: 'cancelled' } : {}), version: { increment: 1 } },
      });
      if (!moved.count) throw new ConflictException('Someone else changed this session. Reload it.');
      if (dto.slots) {
        if (await tx.learningAttendance.count({ where: { organizationId: c.organizationId, slotId: { in: (await tx.learningSessionSlot.findMany({ where: { sessionId: id }, select: { id: true } })).map((x) => x.id) } } })) throw new ConflictException('Attendance is marked already, so the slots stay.');
        await tx.learningSessionSlot.deleteMany({ where: { organizationId: c.organizationId, sessionId: id } });
        await tx.learningSessionSlot.createMany({ data: dto.slots.map((x, i) => ({ organizationId: c.organizationId, sessionId: id, position: i + 1, startsAt: new Date(x.startsAt), endsAt: new Date(x.endsAt) })) });
      }
      const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: s.courseId }, select: { title: true } });
      const holders = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: id, status: { in: OPEN } }, select: { id: true, employeeId: true } });
      if (dto.cancel) await tx.learningEnrolment.updateMany({ where: { id: { in: holders.map((h) => h.id) } }, data: { status: 'cancelled', resultReason: 'Session cancelled', version: { increment: 1 } } });
      const users = (await jobsToday(tx, c, todayIst(), holders.map((h) => h.employeeId))).flatMap((j) => (j.userId ? [j.userId] : []));
      if (dto.cancel || dto.slots || dto.venue) notices.push({ org: c.organizationId, to: users, type: 'learning.session_changed', text: dto.cancel ? `The ${course.title} session is cancelled` : `The ${course.title} session has changed`, link: '/yx/learning' });
      await audit(tx, c, dto.cancel ? 'learning.session.cancelled' : 'learning.session.changed', 'learning_session', id, { slots: Boolean(dto.slots), venue: Boolean(dto.venue), seats: dto.seats, cost: Boolean(dto.costLines) });
      // More seats free up waitlist places.
      if (!dto.cancel && dto.seats) notices.push((await this.promote(tx, c, id)).notice);
      return { ok: true };
    });
    await this.send(notices);
    return out;
  }

  /** Fills free seats from the waitlist in order; returns who moved up and the notice to send them after the commit. */
  private async promote(tx: Tx, c: CompanyContext, sessionId: string): Promise<{ ids: string[]; notice: Notice | null }> {
    const s = await this.session(tx, c, sessionId);
    const taken = await tx.learningEnrolment.count({ where: { organizationId: c.organizationId, sessionId, status: { in: [...SEAT_STATUSES] } } });
    const free = Math.max(0, s.seats - taken);
    if (!free) return { ids: [], notice: null };
    const next = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId, status: 'waitlisted' }, orderBy: { waitlistedAt: 'asc' }, take: free });
    for (const e of next) await tx.learningEnrolment.update({ where: { id: e.id }, data: { status: 'enrolled', waitlistedAt: null, version: { increment: 1 } } });
    if (next.length) {
      const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: s.courseId }, select: { title: true } });
      const users = (await jobsToday(tx, c, todayIst(), next.map((e) => e.employeeId))).flatMap((j) => (j.userId ? [j.userId] : []));
      await audit(tx, c, 'learning.waitlist.promoted', 'learning_session', sessionId, { people: next.length });
      return { ids: next.map((e) => e.employeeId), notice: { org: c.organizationId, to: users, type: 'learning.waitlist_promoted', text: `You have a seat in ${course.title}`, link: '/yx/learning' } };
    }
    return { ids: [], notice: null };
  }

  /** L&D withdraws an attendee or a waitlisted person; the first on the waitlist moves up. */
  async withdraw(ctx: TenantContext, user: ScopeUser, id: string, enrolmentId: string) {
    this.need(await this.viewer(user));
    const notices: (Notice | null)[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.lock(tx, id);
      const s = await this.session(tx, c, id);
      if (s.status !== 'scheduled') throw new ConflictException('This session is over or cancelled.');
      const e = await tx.learningEnrolment.findFirst({ where: { organizationId: c.organizationId, id: enrolmentId, sessionId: id, status: { in: OPEN } } });
      if (!e) throw new NotFoundException('That person has no place in this session.');
      await tx.learningEnrolment.update({ where: { id: e.id }, data: { status: 'cancelled', resultReason: 'Withdrawn by L&D', version: { increment: 1 } } });
      await audit(tx, c, 'learning.session.withdrawn', 'learning_session', id, { enrolmentId });
      const promoted = await this.promote(tx, c, id);
      notices.push(promoted.notice);
      const name = promoted.ids.length ? (await jobsToday(tx, c, todayIst(), promoted.ids))[0]?.name ?? null : null;
      return { promoted: name };
    });
    await this.send(notices);
    return out;
  }

  /** LRN-06 nominate: L&D anyone; a manager the people in their team. Each gets a seat or a waitlist place and is told. */
  async nominate(ctx: TenantContext, user: ScopeUser, id: string, employeeIds: string[]) {
    const v = await this.viewer(user);
    const told: { org: string; to: string[]; text: string }[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c, id);
      const today = todayIst();
      const me = await ownEmployee(tx, c);
      if (!this.ld(v)) {
        if (!me || v.actingForOther) throw new ForbiddenException('Nominations are for managers and L&D.');
        const team = new Set((await tx.$queryRaw<{ id: string }[]>`SELECT e.id::text FROM employees e WHERE e.organization_id = ${c.organizationId}::uuid AND e.id <> ${me}::uuid AND e.id = ANY(${employeeIds}::uuid[]) AND ${await implicitSql(tx, c, me, Prisma.sql`e.id`, Prisma.sql`${today}::date`)}`).map((r) => r.id));
        if (employeeIds.some((x) => !team.has(x))) throw new ForbiddenException('You can nominate only people in your team.');
      }
      const found = new Map((await jobsToday(tx, c, today, employeeIds)).map((j) => [j.employeeId, j]));
      // In the order they were chosen.
      const people = [...new Set(employeeIds)].map((x) => found.get(x)).filter((j): j is NonNullable<typeof j> => Boolean(j));
      if (people.length !== new Set(employeeIds).size) throw new BadRequestException('Choose people who work here today.');
      const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: s.courseId } });
      const result: { name: string; result: string }[] = [];
      for (const p of people) {
        const open = await tx.learningEnrolment.findFirst({ where: { organizationId: c.organizationId, employeeId: p.employeeId, courseId: s.courseId, status: { in: ['requested', ...OPEN] } } });
        if (open) {
          result.push({ name: p.name, result: 'Already enrolled' });
          continue;
        }
        const place = await placeInSession(tx, c, id, s.courseId);
        const waitPos = place.status === 'waitlisted' ? (await tx.learningEnrolment.count({ where: { organizationId: c.organizationId, sessionId: id, status: 'waitlisted' } })) + 1 : 0;
        await tx.learningEnrolment.create({ data: { organizationId: c.organizationId, employeeId: p.employeeId, courseId: s.courseId, sessionId: id, source: 'nominated', assignedOn: asDate(today), dueOn: place.dueOn, status: place.status, waitlistedAt: place.waitlistedAt, createdBy: c.userId ?? null } });
        result.push({ name: p.name, result: place.status === 'waitlisted' ? `Waitlist, position ${waitPos}` : 'Enrolled' });
        if (p.userId) told.push({ org: c.organizationId, to: [p.userId], text: `You were nominated for ${course.title}${place.status === 'waitlisted' ? ' (on the waitlist)' : ''}` });
      }
      await audit(tx, c, 'learning.nominated', 'learning_session', id, { people: people.length, by: this.ld(v) ? 'ld' : 'manager' });
      return { result };
    });
    for (const t of told) await this.tell(t.org, t.to, 'learning.nominated', t.text, '/yx/learning');
    return out;
  }

  /** LRN-06 decline: the nominee says why (at least 10 characters); never for a mandatory course. The manager is told. */
  async decline(ctx: TenantContext, enrolmentId: string, reason: string) {
    const notices: (Notice | null)[] = [];
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      const e = me ? await tx.learningEnrolment.findFirst({ where: { organizationId: c.organizationId, id: enrolmentId, employeeId: me, source: 'nominated', status: { in: ['enrolled', 'waitlisted'] } } }) : null;
      if (!e) throw new NotFoundException('No such nomination.');
      const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: e.courseId } });
      if (course.mandatory) throw new ConflictException('Mandatory courses can’t be declined. Talk to your manager if the date doesn’t work.');
      await tx.learningEnrolment.update({ where: { id: e.id }, data: { status: 'declined', declineReason: reason.trim(), version: { increment: 1 } } });
      await audit(tx, c, 'learning.nomination.declined', 'learning_enrolment', e.id, { course: course.title });
      if (e.sessionId) notices.push((await this.promote(tx, c, e.sessionId)).notice);
      const job = (await jobsToday(tx, c, todayIst(), [me!]))[0];
      const mgr = job?.managerEmployeeId ? (await jobsToday(tx, c, todayIst(), [job.managerEmployeeId]))[0] : null;
      if (mgr?.userId) notices.push({ org: c.organizationId, to: [mgr.userId], type: 'learning.nomination_declined', text: `${job.name} declined ${course.title}: ${reason.trim().slice(0, 120)}`, link: '/yx/learning/team' });
      return { ok: true };
    });
    await this.send(notices);
    return out;
  }

  // ------------------------------------------------------------------------------------------ attendance (LRN-05)

  private code(c: CompanyContext, slotId: string, window: number) {
    return sixDigits(this.crypto.hmac('learning.checkin', `${c.organizationId}:${slotId}:${window}`));
  }

  /** The trainer's screen: the code now, how long it lasts, and who has checked in. */
  async checkinCode(ctx: TenantContext, user: ScopeUser, id: string, slotId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c, id);
      if (!(await this.canRun(tx, c, v, s))) throw new NotFoundException('No such session.');
      const slot = await tx.learningSessionSlot.findFirst({ where: { organizationId: c.organizationId, id: slotId, sessionId: id } });
      if (!slot) throw new NotFoundException('No such slot.');
      const seated = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: id, status: { in: [...SEAT_STATUSES] } }, select: { id: true, employeeId: true } });
      const marks = await tx.learningAttendance.findMany({ where: { organizationId: c.organizationId, slotId, status: { in: ['present', 'late'] } }, select: { enrolmentId: true } });
      const names = new Map((await jobsToday(tx, c, todayIst(), seated.map((e) => e.employeeId))).map((j) => [j.employeeId, j.name]));
      const now = Date.now();
      return {
        closed: Boolean(slot.checkinClosedAt),
        code: slot.checkinClosedAt ? null : this.code(c, slotId, codeWindow(now)),
        secondsLeft: secondsLeft(now),
        everySeconds: CODE_SECONDS,
        expected: seated.map((e) => ({ enrolmentId: e.id, name: names.get(e.employeeId) ?? '' })),
        present: marks.map((m) => m.enrolmentId),
      };
    });
  }

  /** The attendee checks in with the code (scanned or typed); it must be the current code (or the one just before). */
  async checkIn(ctx: TenantContext, dto: { sessionId: string; slotId: string; code: string; via: 'qr' | 'code' }) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      const e = me ? await tx.learningEnrolment.findFirst({ where: { organizationId: c.organizationId, employeeId: me, sessionId: dto.sessionId, status: { in: [...SEAT_STATUSES] } } }) : null;
      if (!e) throw new NotFoundException('You have no seat in this session.');
      const slot = await tx.learningSessionSlot.findFirst({ where: { organizationId: c.organizationId, id: dto.slotId, sessionId: dto.sessionId } });
      if (!slot || slot.checkinClosedAt) throw new ConflictException('Check-in is closed for this slot. Ask the trainer to mark you.');
      const w = codeWindow(Date.now());
      if (dto.code !== this.code(c, slot.id, w) && dto.code !== this.code(c, slot.id, w - 1)) throw new BadRequestException('That code has changed. Scan or type the code on the trainer’s screen now.');
      const late = Date.now() > slot.startsAt.getTime() + 15 * 60_000;
      await tx.learningAttendance.upsert({ where: { slotId_enrolmentId: { slotId: slot.id, enrolmentId: e.id } }, create: { organizationId: c.organizationId, slotId: slot.id, enrolmentId: e.id, status: late ? 'late' : 'present', method: dto.via, markedBy: c.userId ?? null }, update: {} });
      return { status: late ? 'Late' : 'Present' };
    });
  }

  /** Close check-in for a slot (the trainer or L&D); anyone else is marked by hand. */
  async closeCheckin(ctx: TenantContext, user: ScopeUser, id: string, slotId: string) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c, id);
      if (!(await this.canRun(tx, c, v, s))) throw new NotFoundException('No such session.');
      const r = await tx.learningSessionSlot.updateMany({ where: { organizationId: c.organizationId, id: slotId, sessionId: id, checkinClosedAt: null }, data: { checkinClosedAt: new Date() } });
      if (r.count) await audit(tx, c, 'learning.checkin.closed', 'learning_session', id, { slotId });
      return { ok: true };
    });
  }

  /** Marks for one slot by hand (the trainer or L&D), until attendance is confirmed. */
  async mark(ctx: TenantContext, user: ScopeUser, id: string, slotId: string, marks: { enrolmentId: string; status: 'present' | 'late' | 'absent' }[]) {
    const v = await this.viewer(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c, id);
      if (!(await this.canRun(tx, c, v, s))) throw new NotFoundException('No such session.');
      if (s.attendanceConfirmedAt) throw new ConflictException('Attendance is confirmed; the results are out.');
      const slot = await tx.learningSessionSlot.findFirst({ where: { organizationId: c.organizationId, id: slotId, sessionId: id } });
      if (!slot) throw new NotFoundException('No such slot.');
      const seated = new Set((await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: id, status: { in: [...SEAT_STATUSES] } }, select: { id: true } })).map((e) => e.id));
      if (marks.some((m) => !seated.has(m.enrolmentId))) throw new BadRequestException('Mark only people with a seat in this session.');
      for (const m of marks) await tx.learningAttendance.upsert({ where: { slotId_enrolmentId: { slotId, enrolmentId: m.enrolmentId } }, create: { organizationId: c.organizationId, slotId, enrolmentId: m.enrolmentId, status: m.status, method: 'manual', markedBy: c.userId ?? null }, update: { status: m.status, method: 'manual', markedBy: c.userId ?? null, markedAt: new Date() } });
      await audit(tx, c, 'learning.attendance.marked', 'learning_session', id, { slotId, marks: marks.length });
      return { ok: true };
    });
  }

  /** L&D confirms attendance: each seat holder's result follows; completions get their certificate. Once. */
  async confirm(ctx: TenantContext, user: ScopeUser, id: string, version: number) {
    this.need(await this.viewer(user));
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c, id);
      if (s.attendanceConfirmedAt) throw new ConflictException('Attendance is confirmed already.');
      const slots = await tx.learningSessionSlot.findMany({ where: { organizationId: c.organizationId, sessionId: id } });
      if (slots.some((x) => x.endsAt.getTime() > Date.now())) throw new ConflictException('Confirm attendance after the last slot ends.');
      const moved = await tx.learningSession.updateMany({ where: { id, version }, data: { attendanceConfirmedAt: new Date(), status: 'completed', version: { increment: 1 } } });
      if (!moved.count) throw new ConflictException('Someone else changed this session. Reload it.');
      const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: s.courseId } });
      const seated = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, sessionId: id, status: { in: ['enrolled', 'in_progress'] } } });
      const marks = await tx.learningAttendance.findMany({ where: { organizationId: c.organizationId, slotId: { in: slots.map((x) => x.id) }, status: { in: ['present', 'late'] } } });
      const counts = { completed: 0, no_show: 0, failed: 0 };
      for (const e of seated) {
        const r = sessionResult(marks.filter((m) => m.enrolmentId === e.id).length, slots.length, course.attendancePct);
        counts[r.status]++;
        if (r.status === 'completed') {
          await this.learning.completeIn(tx, c, e.id);
          await tx.learningEnrolment.update({ where: { id: e.id }, data: { resultReason: r.reason } });
        } else await tx.learningEnrolment.update({ where: { id: e.id }, data: { status: r.status, resultReason: r.reason, version: { increment: 1 } } });
      }
      // Still waiting when the session is over: the place lapses.
      await tx.learningEnrolment.updateMany({ where: { organizationId: c.organizationId, sessionId: id, status: 'waitlisted' }, data: { status: 'cancelled', resultReason: 'The session ended before a seat came free' } });
      await audit(tx, c, 'learning.attendance.confirmed', 'learning_session', id, counts);
      return counts;
    });
  }

  /** Whether I run sessions as an internal trainer (the menu shows Sessions). */
  async roles(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      return { trainer: Boolean(me && (await tx.learningTrainer.count({ where: { organizationId: c.organizationId, employeeId: me } }))) };
    });
  }

  /** Scheduled sessions of a course with free seats, for self-enrolment and nominations. */
  async upcoming(ctx: TenantContext, courseId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const sessions = await tx.learningSession.findMany({ where: { organizationId: c.organizationId, courseId, status: 'scheduled' } });
      const rows = await this.rows(tx, c, sessions);
      return rows.filter((r) => r.start && Date.parse(r.start) > Date.now()).sort((a, b) => Date.parse(a.start!) - Date.parse(b.start!)).map((r) => ({ id: r.id, label: `${r.course}, ${dayText(new Date(r.start!))}, ${r.venue}`, seats: r.seats, enrolled: r.enrolled, waitlist: r.waitlist }));
    });
  }
}
