import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { settingFor } from '../people/probation';
import type { ScopeUser } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { CoursesService } from './courses.service';
import { CheckDto, MarkDto, ReactionDto, SessionDto } from './dto';
import { attendedShare } from './learning-rules';

// Batch G3b (M07 Q6-Q8, LRN-04 / 05 / 12; answer 2606). learning.manage schedules sessions of classroom and virtual
// courses; the trainer (an employee login) sees their own sessions, shows the check-in code and marks attendance.
// People enrolled in the course book a seat (or wait, first come first served; a withdrawal moves the next person
// up). Closing the session completes the course for those who attended the company's share of slots (default 75%);
// the rest are no-shows. Attendees then rate the session; managers are asked after the company's days (default 60).

const ANY_ENTITY = { legalEntityId: '00000000-0000-0000-0000-000000000000' };
type Slot = { id: string; date: string; start: string; end: string };
const WINDOW_MS = 30_000;

/** The check-in code for a slot at a moment: 6 digits from the session's secret, changing every 30 seconds. */
export function checkInCode(secret: string, slotId: string, at: number): string {
  const n = createHmac('sha256', secret).update(`${slotId}:${Math.floor(at / WINDOW_MS)}`).digest().readUInt32BE(0);
  return String(n % 1_000_000).padStart(6, '0');
}

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly courses: CoursesService,
  ) {}

  private async session(tx: Tx, org: string, id: string) {
    const s = await tx.lrnSession.findFirst({ where: { organizationId: org, id }, include: { course: true } });
    if (!s) throw new NotFoundException('No such session.');
    return s;
  }

  /** L&D (company-wide key) or this session's trainer. */
  private async manage(tx: Tx, user: ScopeUser, org: string, id: string) {
    const s = await this.session(tx, org, id);
    if (s.trainerUserId !== user.userId && !(await this.courses.companyWide(user))) throw new NotFoundException('No such session.');
    return s;
  }

  private async names(tx: Tx, org: string, ids: string[]) {
    const users = await tx.user.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, email: true } });
    return (u: string) => users.find((x) => x.id === u)?.name ?? users.find((x) => x.id === u)?.email ?? 'Former user';
  }

  // ------------------------------------------------------------------------------------------ L&D

  async list(ctx: TenantContext, user: ScopeUser) {
    const ld = await this.courses.companyWide(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.lrnSession.findMany({ where: { organizationId: c.organizationId, ...(ld ? {} : { trainerUserId: user.userId! }) }, orderBy: { createdAt: 'desc' }, take: 300, include: { course: true, seatRows: { where: { status: { in: ['seated', 'waiting'] } } } } });
      const nm = await this.names(tx, c.organizationId, rows.map((r) => r.trainerUserId));
      return rows.map((r) => {
        const slots = r.slots as Slot[];
        return { id: r.id, course: r.course.title, courseId: r.courseId, type: r.course.type, start: slots[0]?.date ?? null, venue: r.venue ?? r.link ?? '', trainer: nm(r.trainerUserId), seats: r.seats, seated: r.seatRows.filter((x) => x.status === 'seated').length, waiting: r.seatRows.filter((x) => x.status === 'waiting').length, status: r.status };
      });
    });
  }

  private check(dto: SessionDto) {
    const ids = new Set<string>();
    for (const s of dto.slots) {
      if (ids.has(s.id)) throw new BadRequestException('Each slot needs its own id.');
      ids.add(s.id);
      if (s.end <= s.start) throw new BadRequestException('A slot ends after it starts.');
    }
    if (dto.slots.some((s) => s.date < todayIst())) throw new BadRequestException('Slots are from today on.');
  }

  async create(ctx: TenantContext, dto: SessionDto) {
    this.check(dto);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await tx.lrnCourse.findFirst({ where: { organizationId: c.organizationId, id: dto.courseId, status: 'published' } });
      if (!course) throw new BadRequestException('Choose a published course.');
      if (course.type === 'self_paced') throw new BadRequestException('A self-paced course has no sessions.');
      if (course.type === 'virtual' && !dto.link) throw new BadRequestException('A virtual session needs its meeting link.');
      if (course.type === 'classroom' && !dto.venue) throw new BadRequestException('A classroom session needs its venue.');
      if (!(await tx.user.findFirst({ where: { organizationId: c.organizationId, id: dto.trainerUserId, status: 'active' }, select: { id: true } }))) throw new BadRequestException('Choose an active person of this company as the trainer.');
      const s = await tx.lrnSession.create({ data: { organizationId: c.organizationId, courseId: course.id, slots: [...dto.slots].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)) as unknown as Prisma.InputJsonValue, venue: dto.venue || null, link: dto.link || null, trainerUserId: dto.trainerUserId, seats: dto.seats, costs: (dto.costs ?? []) as unknown as Prisma.InputJsonValue, codeSecret: randomBytes(24).toString('hex'), createdBy: c.userId! } });
      await audit(tx, c, 'learning.session.created', 'lrn_session', s.id, { courseId: course.id, slots: dto.slots.length, seats: dto.seats });
      const enrolled = await tx.lrnEnrolment.findMany({ where: { organizationId: c.organizationId, courseId: course.id, status: 'enrolled' }, select: { userId: true } });
      return { id: s.id, course: course.title, enrolled: enrolled.map((e) => e.userId) };
    });
    await this.tell(ctx, [dto.trainerUserId], out.id, `You are the trainer of a ${out.course} session.`, `/yx/learning/sessions/${out.id}`);
    await this.tell(ctx, out.enrolled.filter((u) => u !== dto.trainerUserId), out.id, `A ${out.course} session is open: book a seat.`);
    return { id: out.id };
  }

  /** The session page: seats, waitlist, attendance by slot, results (share attended), feedback summary, costs. */
  detail(ctx: TenantContext, user: ScopeUser, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.manage(tx, user, c.organizationId, id);
      const seats = await tx.lrnSessionSeat.findMany({ where: { sessionId: id, status: { in: ['seated', 'waiting'] } }, orderBy: { createdAt: 'asc' } });
      const marks = await tx.lrnAttendance.findMany({ where: { sessionId: id } });
      const fb = await tx.lrnFeedback.findMany({ where: { sessionId: id, kind: 'reaction' } });
      const share = Number(await settingFor(tx, c, 'learning.attendance_share', ANY_ENTITY)) || 75;
      const slots = s.slots as Slot[];
      const nm = await this.names(tx, c.organizationId, [...seats.map((x) => x.userId), s.trainerUserId]);
      const seated = seats.filter((x) => x.status === 'seated');
      const avg = (k: 'overall' | 'trainer') => (fb.length ? Math.round((fb.reduce((a, f) => a + (f[k] ?? 0), 0) / fb.length) * 10) / 10 : null);
      return {
        id: s.id,
        course: s.course.title,
        type: s.course.type,
        venue: s.venue,
        link: s.link,
        trainer: nm(s.trainerUserId),
        isLd: await this.courses.companyWide(user),
        seats: s.seats,
        status: s.status,
        slots,
        share,
        seated: seated.map((x) => ({ userId: x.userId, name: nm(x.userId) })),
        waiting: seats.filter((x) => x.status === 'waiting').map((x) => ({ userId: x.userId, name: nm(x.userId) })),
        attendance: seated.map((x) => ({ userId: x.userId, name: nm(x.userId), marks: slots.map((sl) => marks.find((m) => m.userId === x.userId && m.slotId === sl.id)?.mark ?? null), method: [...new Set(marks.filter((m) => m.userId === x.userId).map((m) => m.method))].join(', ') })),
        results: seated.map((x) => {
          const attended = slots.filter((sl) => marks.some((m) => m.userId === x.userId && m.slotId === sl.id && m.mark !== 'absent')).length;
          return { userId: x.userId, name: nm(x.userId), attended, ok: attendedShare(attended, slots.length) >= share };
        }),
        feedback: { responses: fb.length, overall: avg('overall'), trainer: avg('trainer'), comments: fb.map((f) => f.comment).filter((x): x is string => Boolean(x)) },
        costs: s.costs as { label: string; amount: number }[],
      };
    });
  }

  /** The current check-in code for a slot (the trainer or L&D shows it). */
  code(ctx: TenantContext, user: ScopeUser, id: string, slotId: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.manage(tx, user, c.organizationId, id);
      if (s.status !== 'scheduled') throw new ConflictException({ statusCode: 409, code: 'LEARNING_SESSION_CLOSED', message: 'This session is closed.' });
      if (!(s.slots as Slot[]).some((x) => x.id === slotId)) throw new NotFoundException('No such slot.');
      const now = Date.now();
      return { code: checkInCode(s.codeSecret, slotId, now), secondsLeft: Math.ceil((WINDOW_MS - (now % WINDOW_MS)) / 1000) };
    });
  }

  /** Marks by hand (the trainer or L&D); only seated people, only this session's slots. */
  mark(ctx: TenantContext, user: ScopeUser, id: string, dto: MarkDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.manage(tx, user, c.organizationId, id);
      if (s.status !== 'scheduled') throw new ConflictException({ statusCode: 409, code: 'LEARNING_SESSION_CLOSED', message: 'This session is closed.' });
      if (!(s.slots as Slot[]).some((x) => x.id === dto.slotId)) throw new NotFoundException('No such slot.');
      const seated = new Set((await tx.lrnSessionSeat.findMany({ where: { sessionId: id, status: 'seated' }, select: { userId: true } })).map((x) => x.userId));
      for (const m of dto.marks) {
        if (!seated.has(m.userId)) throw new BadRequestException('Mark only people with a seat in this session.');
        await tx.lrnAttendance.upsert({ where: { sessionId_slotId_userId: { sessionId: id, slotId: dto.slotId, userId: m.userId } }, create: { organizationId: c.organizationId, sessionId: id, slotId: dto.slotId, userId: m.userId, mark: m.mark, method: 'manual', markedBy: c.userId }, update: { mark: m.mark, method: 'manual', markedBy: c.userId, markedAt: new Date() } });
      }
      await audit(tx, c, 'learning.session.marked', 'lrn_session', id, { slotId: dto.slotId, marks: dto.marks.length });
      return { marked: dto.marks.length };
    });
  }

  /** L&D withdraws someone; the first person waiting takes the seat and is told. */
  async withdraw(ctx: TenantContext, id: string, userId: string) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => this.leave(tx, c, id, userId));
    if (out.promoted) await this.tell(ctx, [out.promoted], id, `A seat opened: you are in ${out.course} now.`);
    return { promoted: out.promoted };
  }

  private async leave(tx: Tx, c: CompanyContext, id: string, userId: string) {
    const s = await this.session(tx, c.organizationId, id);
    if (s.status !== 'scheduled') throw new ConflictException({ statusCode: 409, code: 'LEARNING_SESSION_CLOSED', message: 'This session is closed.' });
    const seat = await tx.lrnSessionSeat.findFirst({ where: { sessionId: id, userId, status: { in: ['seated', 'waiting'] } } });
    if (!seat) throw new NotFoundException('No such seat.');
    await tx.lrnSessionSeat.update({ where: { id: seat.id }, data: { status: 'withdrawn' } });
    let promoted: string | null = null;
    if (seat.status === 'seated') {
      const next = await tx.lrnSessionSeat.findFirst({ where: { sessionId: id, status: 'waiting' }, orderBy: { createdAt: 'asc' } });
      if (next) {
        await tx.lrnSessionSeat.update({ where: { id: next.id }, data: { status: 'seated' } });
        promoted = next.userId;
      }
    }
    await audit(tx, c, 'learning.session.withdrawn', 'lrn_session', id, { userId, promoted });
    return { promoted, course: s.course.title };
  }

  /** Close: completion for those who attended the company's share of slots; the rest are no-shows; attendees asked for feedback. */
  async close(ctx: TenantContext, user: ScopeUser, id: string) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c.organizationId, id);
      if (!(await this.courses.companyWide(user))) throw new ForbiddenException('L&D closes a session.');
      if (s.status !== 'scheduled') throw new ConflictException({ statusCode: 409, code: 'LEARNING_SESSION_CLOSED', message: 'This session is closed already.' });
      const slots = s.slots as Slot[];
      if (slots[slots.length - 1].date > todayIst()) throw new BadRequestException('Close the session after its last slot.');
      const share = Number(await settingFor(tx, c, 'learning.attendance_share', ANY_ENTITY)) || 75;
      const seats = await tx.lrnSessionSeat.findMany({ where: { sessionId: id, status: 'seated' }, include: { enrolment: true } });
      const marks = await tx.lrnAttendance.findMany({ where: { sessionId: id, mark: { in: ['present', 'late'] } } });
      const completed: string[] = [];
      for (const seat of seats) {
        const attended = new Set(marks.filter((m) => m.userId === seat.userId).map((m) => m.slotId)).size;
        if (seat.enrolment.status !== 'enrolled') continue;
        if (attendedShare(attended, slots.length) >= share) {
          await this.courses.complete(tx, c, seat.enrolment, s.course);
          completed.push(seat.userId);
        } else await tx.lrnEnrolment.update({ where: { id: seat.enrolmentId }, data: { status: 'no_show' } });
      }
      await tx.lrnSession.update({ where: { id }, data: { status: 'closed', closedAt: new Date() } });
      await audit(tx, c, 'learning.session.closed', 'lrn_session', id, { completed: completed.length, noShow: seats.length - completed.length });
      return { completed, noShow: seats.length - completed.length, course: s.course.title };
    });
    await this.tell(ctx, out.completed, id, `You completed ${out.course}. Tell us how the session went.`);
    return { completed: out.completed.length, noShow: out.noShow };
  }

  private async tell(ctx: TenantContext, users: string[], id: string, text: string, linkPath = '/yx/learning') {
    if (!users.length) return;
    await this.notifications
      .notifySystem(ctx, users, 'learning.enrolment.update', { entityType: 'lrn_session', entityId: id, contextText: text, linkPath }, { subject: 'An update on your learning in YukthiX', html: '<p>There is an update on your learning in YukthiX.</p>' })
      .catch((e: Error) => this.logger.warn(`session notice: ${e.message}`));
  }

  // ------------------------------------------------------------------------------------------ the learner

  /** Sessions of the courses I am enrolled in: the ones I can book, and my seats. */
  mine(ctx: TenantContext, user: ScopeUser) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const open = await tx.lrnEnrolment.findMany({ where: { organizationId: c.organizationId, userId: me, status: { in: ['enrolled', 'completed'] } }, select: { courseId: true, status: true } });
      const rows = await tx.lrnSession.findMany({ where: { organizationId: c.organizationId, courseId: { in: open.map((o) => o.courseId) } }, include: { course: true, seatRows: { where: { status: { in: ['seated', 'waiting'] } }, orderBy: { createdAt: 'asc' } }, feedback: { where: { aboutUserId: me, kind: 'reaction' } } } });
      const nm = await this.names(tx, c.organizationId, rows.map((r) => r.trainerUserId));
      return rows
        .filter((s) => s.status !== 'cancelled')
        .map((s) => {
          const mine = s.seatRows.find((x) => x.userId === me);
          const waiting = s.seatRows.filter((x) => x.status === 'waiting');
          return { id: s.id, courseId: s.courseId, course: s.course.title, type: s.course.type, trainer: nm(s.trainerUserId), slots: s.slots as Slot[], venue: s.venue, link: mine?.status === 'seated' ? s.link : null, status: s.status, seatsLeft: Math.max(0, s.seats - s.seatRows.filter((x) => x.status === 'seated').length), mySeat: mine ? (mine.status === 'seated' ? 'seated' : `waiting ${waiting.findIndex((x) => x.id === mine.id) + 1}`) : null, canRate: s.status === 'closed' && Boolean(mine && mine.status === 'seated') && !s.feedback.length };
        });
    });
  }

  /** Book a seat (or join the waitlist) in a session of a course I am enrolled in. */
  book(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c.organizationId, id);
      if (s.status !== 'scheduled') throw new ConflictException({ statusCode: 409, code: 'LEARNING_SESSION_CLOSED', message: 'This session is closed.' });
      const e = await tx.lrnEnrolment.findFirst({ where: { organizationId: c.organizationId, courseId: s.courseId, userId: me, status: 'enrolled' } });
      if (!e) throw new NotFoundException('Enrol in the course first.');
      if (await tx.lrnSessionSeat.findFirst({ where: { userId: me, enrolmentId: e.id, status: { in: ['seated', 'waiting'] } } })) throw new ConflictException({ statusCode: 409, code: 'LEARNING_ALREADY_BOOKED', message: 'You have a seat (or a place on a waitlist) for this course already.' });
      // Lock the session row so two people can't take the last seat together.
      await tx.$executeRaw`SELECT id FROM lrn_sessions WHERE id = ${id}::uuid FOR UPDATE`;
      const seated = await tx.lrnSessionSeat.count({ where: { sessionId: id, status: 'seated' } });
      const status = seated < s.seats ? 'seated' : 'waiting';
      await tx.lrnSessionSeat.create({ data: { organizationId: c.organizationId, sessionId: id, enrolmentId: e.id, userId: me, status } });
      await audit(tx, c, 'learning.session.booked', 'lrn_session', id, { status });
      return { status, position: status === 'waiting' ? (await tx.lrnSessionSeat.count({ where: { sessionId: id, status: 'waiting' } })) : null };
    });
  }

  async cancelSeat(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = this.self(user);
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => this.leave(tx, c, id, me));
    if (out.promoted) await this.tell(ctx, [out.promoted], id, `A seat opened: you are in ${out.course} now.`);
    return { cancelled: true };
  }

  /** I check in for a slot with the code the trainer shows (this window or the one before); on the slot's day only. */
  checkIn(ctx: TenantContext, user: ScopeUser, id: string, dto: CheckDto) {
    const me = this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c.organizationId, id);
      if (s.status !== 'scheduled') throw new ConflictException({ statusCode: 409, code: 'LEARNING_SESSION_CLOSED', message: 'This session is closed.' });
      const slot = (s.slots as Slot[]).find((x) => x.id === dto.slotId);
      if (!slot) throw new NotFoundException('No such slot.');
      if (slot.date !== todayIst()) throw new BadRequestException('Check in on the day of the slot.');
      if (!(await tx.lrnSessionSeat.findFirst({ where: { sessionId: id, userId: me, status: 'seated' } }))) throw new NotFoundException('You have no seat in this session.');
      const now = Date.now();
      if (![now, now - WINDOW_MS].some((t) => checkInCode(s.codeSecret, slot.id, t) === dto.code)) throw new BadRequestException('That code is not right or has changed. Type the code shown now.');
      await tx.lrnAttendance.upsert({ where: { sessionId_slotId_userId: { sessionId: id, slotId: slot.id, userId: me } }, create: { organizationId: c.organizationId, sessionId: id, slotId: slot.id, userId: me, mark: 'present', method: 'code' }, update: {} });
      return { checkedIn: true };
    });
  }

  /** My reaction once the session closed (seated people only, once). */
  react(ctx: TenantContext, user: ScopeUser, id: string, dto: ReactionDto) {
    const me = this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const s = await this.session(tx, c.organizationId, id);
      if (s.status !== 'closed' || !(await tx.lrnSessionSeat.findFirst({ where: { sessionId: id, userId: me, status: 'seated' } }))) throw new NotFoundException('No such session to rate.');
      const made = await tx.lrnFeedback.createMany({ data: [{ organizationId: c.organizationId, sessionId: id, kind: 'reaction', aboutUserId: me, byUserId: me, overall: dto.overall, trainer: dto.trainer, comment: dto.comment || null }], skipDuplicates: true });
      if (!made.count) throw new ConflictException({ statusCode: 409, code: 'LEARNING_RATED', message: 'You rated this session already.' });
      return { rated: true };
    });
  }

  /** Managers asked to check: my reports who completed a session at least the company's days ago, not checked yet. */
  checksDue(ctx: TenantContext, user: ScopeUser) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const days = Number(await settingFor(tx, c, 'learning.check_after_days', ANY_ENTITY)) || 60;
      const before = new Date(Date.now() - days * 86_400_000);
      const reports = await this.reports(tx, c.organizationId, me);
      if (!reports.length) return [];
      const seats = await tx.lrnSessionSeat.findMany({ where: { organizationId: c.organizationId, userId: { in: reports }, status: 'seated', session: { status: 'closed', closedAt: { lte: before } }, enrolment: { status: 'completed' } }, include: { session: { include: { course: true, feedback: { where: { kind: 'check' } } } } } });
      const nm = await this.names(tx, c.organizationId, seats.map((s) => s.userId));
      return seats.filter((s) => !s.session.feedback.some((f) => f.aboutUserId === s.userId)).map((s) => ({ sessionId: s.sessionId, userId: s.userId, person: nm(s.userId), course: s.session.course.title, closedOn: s.session.closedAt!.toISOString().slice(0, 10) }));
    });
  }

  private async reports(tx: Tx, org: string, me: string) {
    const today = todayIst();
    const mine = await tx.employee.findFirst({ where: { organizationId: org, userId: me }, select: { id: true } });
    if (!mine) return [];
    return (await tx.$queryRaw<{ user_id: string }[]>`SELECT DISTINCT e.user_id::text FROM employee_assignments ea JOIN employees e ON e.organization_id = ea.organization_id AND e.id = ea.employee_id
      WHERE ea.organization_id = ${org}::uuid AND ea.manager_employee_id = ${mine.id}::uuid AND ea.superseded_at IS NULL AND e.user_id IS NOT NULL
        AND ea.valid_from <= ${today}::date AND (ea.valid_to IS NULL OR ea.valid_to >= ${today}::date)`).map((r) => r.user_id);
  }

  /** The manager's check about one report (only their own reports; only when due; once). */
  managerCheck(ctx: TenantContext, user: ScopeUser, id: string, aboutUserId: string, applying: 'yes' | 'partly' | 'no' | 'early', comment?: string) {
    const me = this.self(user);
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const due = (await this.checksDue(ctx, user)).some((d) => d.sessionId === id && d.userId === aboutUserId);
      if (!due) throw new NotFoundException('No check is due for this person.');
      await tx.lrnFeedback.create({ data: { organizationId: c.organizationId, sessionId: id, kind: 'check', aboutUserId, byUserId: me, applying, comment: comment || null } });
      await audit(tx, c, 'learning.session.checked', 'lrn_session', id, { aboutUserId, applying });
      return { checked: true };
    });
  }

  /** The daily job: tell managers when their reports' checks fall due (once per session). */
  async askChecks(): Promise<number> {
    const rows = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.lrnSession.findMany({ where: { status: 'closed', checkSentAt: null }, orderBy: { closedAt: 'asc' }, take: 200 }));
    let n = 0;
    for (const s of rows) {
      const c: CompanyContext = { organizationId: s.organizationId, isSuperAdmin: false, userId: null };
      const managers = await this.tenantPrisma.forTenant(c, async (tx) => {
        const days = Number(await settingFor(tx, c, 'learning.check_after_days', ANY_ENTITY)) || 60;
        if (s.closedAt!.getTime() > Date.now() - days * 86_400_000) return null;
        await tx.lrnSession.update({ where: { id: s.id }, data: { checkSentAt: new Date() } });
        const people = (await tx.lrnSessionSeat.findMany({ where: { sessionId: s.id, status: 'seated', enrolment: { status: 'completed' } }, select: { userId: true } })).map((x) => x.userId);
        const today = todayIst();
        return (await tx.$queryRaw<{ user_id: string }[]>`SELECT DISTINCT m.user_id::text FROM employee_assignments ea
          JOIN employees e ON e.organization_id = ea.organization_id AND e.id = ea.employee_id
          JOIN employees m ON m.organization_id = ea.organization_id AND m.id = ea.manager_employee_id
          WHERE ea.organization_id = ${s.organizationId}::uuid AND e.user_id = ANY(${people}::uuid[]) AND m.user_id IS NOT NULL AND ea.superseded_at IS NULL
            AND ea.valid_from <= ${today}::date AND (ea.valid_to IS NULL OR ea.valid_to >= ${today}::date)`).map((r) => r.user_id);
      });
      if (!managers?.length) continue;
      n++;
      await this.tell({ organizationId: s.organizationId, isSuperAdmin: false } as TenantContext, managers, s.id, 'Is your team applying what they learnt? A training check is waiting for you.', '/yx/learning/checks');
    }
    return n;
  }

  private self(user: ScopeUser) {
    if (!user.userId || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves does this.');
    return user.userId;
  }
}
