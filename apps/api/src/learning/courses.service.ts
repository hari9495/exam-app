import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, companyContext, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, buildViewer, tenantWide } from '../access/scope';
import { NotificationsService } from '../notifications/notifications.service';
import { FilesService } from '../documents/files.service';
import { safeName } from '../service-desk/attachments.service';
import { CourseDto, FileItemDto } from './dto';
import { addMonths, progressOf } from './learning-rules';

// Batch G3a (M07 Q1-Q2, LRN-01 / 02 / 03 / 06; answers 2606, 2608). learning.manage (held for the whole company)
// builds and publishes courses and decides enrolment requests. Everyone sees the published catalogue, enrols (or asks,
// when the course needs approval), works through the items and gets a certificate when the required items are done.
// A manager nominates their own direct reports; L&D anyone. A mandatory course can't be declined. Scores and progress
// are seen by the person, their manager chain and L&D only (answer 2608).

const VIDEO_PDF = ['video/mp4', 'application/pdf'] as const;
type Course = Prisma.LrnCourseGetPayload<{ include: { items: true } }>;

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly notifications: NotificationsService,
    private readonly files: FilesService,
  ) {}

  async companyWide(user: ScopeUser) {
    const v = await buildViewer(this.prisma, this.tenantPrisma, user, ['learning.manage']);
    return tenantWide(v, 'learning.manage');
  }

  private async course(tx: Tx, org: string, id: string): Promise<Course> {
    const c = await tx.lrnCourse.findFirst({ where: { organizationId: org, id }, include: { items: { orderBy: { position: 'asc' } } } });
    if (!c) throw new NotFoundException('No such course.');
    return c;
  }

  private view(c: Course) {
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      type: c.type as 'self_paced' | 'classroom' | 'virtual',
      durationMinutes: c.durationMinutes,
      cost: c.cost,
      mandatory: c.mandatory,
      needsApproval: c.needsApproval,
      certificate: c.certificate,
      validMonths: c.validMonths,
      skills: c.skills as { skillId: string; level: number }[],
      status: c.status as 'draft' | 'published' | 'retired',
      items: c.items.map((i) => ({ id: i.id, title: i.title, kind: i.kind as 'video' | 'pdf' | 'link', url: i.url, fileId: i.fileId, minutes: i.minutes, required: i.required })),
    };
  }

  // ------------------------------------------------------------------------------------------ L&D

  list(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const rows = await tx.lrnCourse.findMany({ where: { organizationId: c.organizationId }, orderBy: { updatedAt: 'desc' }, include: { items: true, enrolments: { select: { status: true } } } });
      return rows.map((r) => ({ ...this.view(r), enrolled: r.enrolments.filter((e) => e.status === 'enrolled').length, completed: r.enrolments.filter((e) => e.status === 'completed').length, requested: r.enrolments.filter((e) => e.status === 'requested').length }));
    });
  }

  /** The skills a course can raise (the company's skills library). */
  skillOptions(ctx: TenantContext) {
    return inCompany(this.tenantPrisma, ctx, (tx, c) => tx.companySkill.findMany({ where: { organizationId: c.organizationId, status: 'active' }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 1000 }));
  }

  create(ctx: TenantContext, dto: CourseDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      await this.checkSkills(tx, c.organizationId, dto);
      if (dto.items.some((i) => i.kind !== 'link' || i.id)) throw new BadRequestException('A new course starts with links only; add videos and PDFs once it is saved.');
      const row = await tx.lrnCourse.create({ data: { organizationId: c.organizationId, ...this.meta(dto), createdBy: c.userId! } });
      await this.saveItems(tx, c.organizationId, row.id, dto);
      await audit(tx, c, 'learning.course.created', 'lrn_course', row.id, { type: dto.type, items: dto.items.length });
      return { id: row.id };
    });
  }

  private meta(dto: CourseDto) {
    if (!dto.certificate && dto.validMonths) throw new BadRequestException('Valid months need a certificate.');
    return { title: dto.title, description: dto.description || null, type: dto.type, durationMinutes: dto.durationMinutes, cost: dto.cost, mandatory: dto.mandatory, needsApproval: dto.mandatory ? false : dto.needsApproval, certificate: dto.certificate, validMonths: dto.certificate ? (dto.validMonths ?? null) : null, skills: dto.skills as unknown as Prisma.InputJsonValue };
  }

  private async checkSkills(tx: Tx, org: string, dto: CourseDto) {
    const ids = dto.skills.map((s) => s.skillId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each skill once.');
    if (ids.length && (await tx.companySkill.count({ where: { organizationId: org, id: { in: ids }, status: 'active' } })) !== ids.length) throw new BadRequestException('Choose skills from the company’s skills library.');
  }

  /** Items in the order given: existing ones kept (title, minutes, required), links added; items left out are removed. */
  private async saveItems(tx: Tx, org: string, courseId: string, dto: CourseDto) {
    const have = await tx.lrnCourseItem.findMany({ where: { courseId } });
    for (const i of dto.items) {
      if (i.kind === 'link' && !i.url) throw new BadRequestException(`“${i.title}” needs its link.`);
      if (i.kind !== 'link' && i.url) throw new BadRequestException(`“${i.title}” is a file, not a link.`);
      if (i.id && !have.some((h) => h.id === i.id && h.kind === i.kind)) throw new BadRequestException('An item does not belong to this course.');
      if (!i.id && i.kind !== 'link') throw new BadRequestException('Upload videos and PDFs with Add video or PDF.');
    }
    const keep = new Set(dto.items.map((i) => i.id).filter(Boolean));
    await tx.lrnCourseItem.deleteMany({ where: { courseId, id: { notIn: [...keep] as string[] } } });
    let n = 0;
    for (const i of dto.items) {
      n++;
      if (i.id) await tx.lrnCourseItem.update({ where: { id: i.id }, data: { title: i.title, minutes: i.minutes, required: i.required, position: n, ...(i.kind === 'link' ? { url: i.url } : {}) } });
      else await tx.lrnCourseItem.create({ data: { organizationId: org, courseId, position: n, title: i.title, kind: 'link', url: i.url, minutes: i.minutes, required: i.required } });
    }
  }

  detail(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await this.course(tx, c.organizationId, id);
      const enrol = await tx.lrnEnrolment.findMany({ where: { courseId: id }, orderBy: { createdAt: 'desc' }, take: 500 });
      const users = await tx.user.findMany({ where: { organizationId: c.organizationId, id: { in: enrol.map((e) => e.userId) } }, select: { id: true, name: true, email: true } });
      const fileRows = await tx.file.findMany({ where: { organizationId: c.organizationId, id: { in: course.items.map((i) => i.fileId).filter((x): x is string => Boolean(x)) } }, select: { id: true, scanStatus: true } });
      return {
        ...this.view(course),
        items: this.view(course).items.map((i) => ({ ...i, scan: i.fileId ? (fileRows.find((f) => f.id === i.fileId)?.scanStatus ?? 'pending') : null })),
        enrolments: enrol.map((e) => ({ id: e.id, person: users.find((u) => u.id === e.userId)?.name ?? users.find((u) => u.id === e.userId)?.email ?? 'Former user', status: e.status, source: e.source, dueOn: e.dueOn?.toISOString().slice(0, 10) ?? null, reason: e.reason, createdAt: e.createdAt.toISOString() })),
      };
    });
  }

  update(ctx: TenantContext, id: string, dto: CourseDto) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await this.course(tx, c.organizationId, id);
      if (course.status === 'retired') throw new ConflictException({ statusCode: 409, code: 'LEARNING_RETIRED', message: 'A retired course can’t change.' });
      await this.checkSkills(tx, c.organizationId, dto);
      await this.saveItems(tx, c.organizationId, id, dto);
      if (course.status === 'published' && !dto.items.some((i) => i.required)) throw new BadRequestException('A published course needs at least one required item.');
      await tx.lrnCourse.update({ where: { id }, data: { ...this.meta(dto), updatedAt: new Date() } });
      await audit(tx, c, 'learning.course.updated', 'lrn_course', id, { items: dto.items.length });
      return { id };
    });
  }

  /** A video (MP4) or PDF becomes a new item at the end; scanned before anyone can open it. */
  async addFile(ctx: TenantContext, id: string, dto: FileItemDto, file: { name: string; data: Buffer } | null) {
    if (!file?.data?.length) throw new BadRequestException('Choose a video (MP4) or a PDF.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await this.course(tx, c.organizationId, id);
      if (course.status === 'retired') throw new ConflictException({ statusCode: 409, code: 'LEARNING_RETIRED', message: 'A retired course can’t change.' });
      if (course.items.length >= 100) throw new BadRequestException('A course has at most 100 items.');
      const f = await this.files.storeIn(tx, c, { area: 'learning', name: safeName(file.name), data: file.data, allowedMime: VIDEO_PDF, maxMb: 50, via: 'staff' });
      const item = await tx.lrnCourseItem.create({ data: { organizationId: c.organizationId, courseId: id, position: course.items.length + 1, title: dto.title, kind: f.mime === 'application/pdf' ? 'pdf' : 'video', fileId: f.id, minutes: dto.minutes, required: true } });
      await audit(tx, c, 'learning.course.file_added', 'lrn_course', id, { itemId: item.id, fileId: f.id });
      return { id: item.id, fileId: f.id };
    });
    void this.files.scan(companyContext(ctx).organizationId, out.fileId).catch(() => undefined);
    return { id: out.id };
  }

  publish(ctx: TenantContext, id: string) {
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await this.course(tx, c.organizationId, id);
      if (course.status !== 'draft') throw new ConflictException({ statusCode: 409, code: 'LEARNING_NOT_DRAFT', message: 'Only a draft is published.' });
      if (!course.items.some((i) => i.required)) throw new BadRequestException('Mark at least one item as required: completion is checked against them.');
      await tx.lrnCourse.update({ where: { id }, data: { status: 'published', updatedAt: new Date() } });
      await audit(tx, c, 'learning.course.published', 'lrn_course', id, {});
      return { status: 'published' };
    });
  }

  /** L&D approves or refuses a request to join a course that needs approval. */
  async decide(ctx: TenantContext, enrolmentId: string, approve: boolean, reason?: string) {
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await tx.lrnEnrolment.findFirst({ where: { organizationId: c.organizationId, id: enrolmentId }, include: { course: true } });
      if (!e) throw new NotFoundException('No such request.');
      if (e.status !== 'requested') throw new ConflictException({ statusCode: 409, code: 'LEARNING_NOT_REQUESTED', message: 'This request was decided already.' });
      if (!approve && !reason?.trim()) throw new BadRequestException('Say why the request is refused.');
      await tx.lrnEnrolment.update({ where: { id: e.id }, data: { status: approve ? 'enrolled' : 'refused', decidedBy: c.userId, reason: approve ? null : reason!.trim() } });
      await audit(tx, c, approve ? 'learning.enrolment.approved' : 'learning.enrolment.refused', 'lrn_enrolment', e.id, { courseId: e.courseId });
      return e;
    });
    await this.tell(ctx, [out.userId], out.id, approve ? `You are enrolled in ${out.course.title}.` : `Your request to join ${out.course.title} was refused: ${reason}`);
    return { status: approve ? 'enrolled' : 'refused' };
  }

  // ------------------------------------------------------------------------------------------ nominating

  /** Whom I may nominate: L&D anyone active; a manager their direct reports today. */
  private async nominable(tx: Tx, org: string, user: ScopeUser, ld: boolean, q?: string) {
    const today = todayIst();
    const me = await tx.employee.findFirst({ where: { organizationId: org, userId: user.userId! }, select: { id: true } });
    const reportIds = ld
      ? null
      : me
        ? (await tx.$queryRaw<{ user_id: string }[]>`SELECT DISTINCT e.user_id::text FROM employee_assignments ea JOIN employees e ON e.organization_id = ea.organization_id AND e.id = ea.employee_id
            WHERE ea.organization_id = ${org}::uuid AND ea.manager_employee_id = ${me.id}::uuid AND ea.superseded_at IS NULL AND e.user_id IS NOT NULL
              AND ea.valid_from <= ${today}::date AND (ea.valid_to IS NULL OR ea.valid_to >= ${today}::date)`).map((r) => r.user_id)
        : [];
    const users = await tx.user.findMany({ where: { organizationId: org, status: 'active', ...(reportIds ? { id: { in: reportIds } } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 200 });
    return users.map((u) => ({ id: u.id, name: u.name ?? u.email }));
  }

  async people(ctx: TenantContext, user: ScopeUser, q?: string) {
    const ld = await this.companyWide(user);
    return inCompany(this.tenantPrisma, ctx, (tx, c) => this.nominable(tx, c.organizationId, user, ld, q));
  }

  async nominate(ctx: TenantContext, user: ScopeUser, courseId: string, userIds: string[], dueOn?: string) {
    const ld = await this.companyWide(user);
    if (dueOn && dueOn < todayIst()) throw new BadRequestException('Choose a day from today on.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await this.course(tx, c.organizationId, courseId);
      if (course.status !== 'published') throw new NotFoundException('No such course.');
      const allowed = new Set((await this.nominable(tx, c.organizationId, user, ld)).map((p) => p.id));
      const ids = [...new Set(userIds)];
      if (!ids.length || ids.some((u) => !allowed.has(u))) throw new ForbiddenException(ld ? 'Choose active people of this company.' : 'A manager nominates their own direct reports.');
      const made: string[] = [];
      for (const u of ids) {
        const open = await tx.lrnEnrolment.findFirst({ where: { courseId, userId: u, status: { in: ['requested', 'enrolled'] } } });
        if (open) {
          if (open.status === 'requested') await tx.lrnEnrolment.update({ where: { id: open.id }, data: { status: 'enrolled', source: 'nominated', nominatedBy: c.userId, dueOn: dueOn ? new Date(`${dueOn}T00:00:00Z`) : open.dueOn } });
          continue;
        }
        await tx.lrnEnrolment.create({ data: { organizationId: c.organizationId, courseId, userId: u, source: 'nominated', status: 'enrolled', nominatedBy: c.userId, dueOn: dueOn ? new Date(`${dueOn}T00:00:00Z`) : null } });
        made.push(u);
      }
      await audit(tx, c, 'learning.enrolment.nominated', 'lrn_course', courseId, { people: ids.length, dueOn: dueOn ?? null });
      return { course, made };
    });
    await this.tell(ctx, out.made, courseId, `You were nominated for ${out.course.title}${dueOn ? `, to finish by ${dueOn}` : ''}.`);
    return { nominated: out.made.length };
  }

  private async tell(ctx: TenantContext, users: string[], entityId: string, text: string) {
    if (!users.length) return;
    await this.notifications
      .notifySystem(ctx, users, 'learning.enrolment.update', { entityType: 'lrn_course', entityId, contextText: text, linkPath: '/yx/learning' }, { subject: 'An update on your learning in YukthiX', html: '<p>There is an update on your learning in YukthiX.</p>' })
      .catch((e: Error) => this.logger.warn(`learning notice: ${e.message}`));
  }

  // ------------------------------------------------------------------------------------------ the learner

  /** My learning: my open and finished enrolments with progress, my certificates, and the published catalogue. */
  mine(ctx: TenantContext, user: ScopeUser) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const org = c.organizationId;
      const enrol = await tx.lrnEnrolment.findMany({ where: { organizationId: org, userId: me, status: { in: ['requested', 'enrolled', 'completed'] } }, orderBy: { createdAt: 'desc' }, include: { course: { include: { items: true } }, progress: true } });
      const certs = await tx.lrnCertificate.findMany({ where: { organizationId: org, userId: me }, orderBy: { issuedOn: 'desc' } });
      const catalogue = await tx.lrnCourse.findMany({ where: { organizationId: org, status: 'published' }, orderBy: { title: 'asc' }, include: { items: true } });
      const today = todayIst();
      return {
        enrolments: enrol.map((e) => ({
          id: e.id,
          course: this.view(e.course),
          status: e.status === 'enrolled' && e.dueOn && e.dueOn.toISOString().slice(0, 10) < today ? 'overdue' : (e.status as 'requested' | 'enrolled' | 'completed'),
          source: e.source,
          dueOn: e.dueOn?.toISOString().slice(0, 10) ?? null,
          progress: progressOf(e.course.items, e.progress.map((p) => p.itemId)),
          canDecline: e.status === 'enrolled' && e.source === 'nominated' && !e.course.mandatory,
        })),
        certificates: certs.map((x) => ({ id: x.id, title: x.title, issuedOn: x.issuedOn.toISOString().slice(0, 10), expiresOn: x.expiresOn?.toISOString().slice(0, 10) ?? null })),
        catalogue: catalogue.map((x) => ({ ...this.view(x), mine: enrol.find((e) => e.courseId === x.id && e.status !== 'completed')?.id ?? null })),
      };
    });
  }

  /** Enrol myself: straight in, or a request when the course needs approval. */
  async enrol(ctx: TenantContext, user: ScopeUser, courseId: string) {
    const me = user.userId;
    if (!me || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves enrols.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const course = await this.course(tx, c.organizationId, courseId);
      if (course.status !== 'published') throw new NotFoundException('No such course.');
      if (await tx.lrnEnrolment.findFirst({ where: { courseId, userId: me, status: { in: ['requested', 'enrolled'] } } })) throw new ConflictException({ statusCode: 409, code: 'LEARNING_ALREADY', message: 'You are in this course already (or asked to be).' });
      const e = await tx.lrnEnrolment.create({ data: { organizationId: c.organizationId, courseId, userId: me, source: 'self', status: course.needsApproval ? 'requested' : 'enrolled' } });
      await audit(tx, c, 'learning.enrolment.self', 'lrn_enrolment', e.id, { courseId, requested: course.needsApproval });
      return { id: e.id, status: e.status };
    });
  }

  private async myEnrolment(tx: Tx, org: string, me: string, id: string) {
    const e = await tx.lrnEnrolment.findFirst({ where: { organizationId: org, id, userId: me }, include: { course: { include: { items: { orderBy: { position: 'asc' } } } }, progress: true } });
    if (!e) throw new NotFoundException('No such course.');
    return e;
  }

  /** The player: the course's items and which I finished. */
  player(ctx: TenantContext, user: ScopeUser, id: string) {
    const me = user.userId!;
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.myEnrolment(tx, c.organizationId, me, id);
      if (!['enrolled', 'completed'].includes(e.status)) throw new ConflictException({ statusCode: 409, code: 'LEARNING_NOT_ENROLLED', message: 'You are not enrolled in this course yet.' });
      const done = new Set(e.progress.map((p) => p.itemId));
      const cert = await tx.lrnCertificate.findFirst({ where: { enrolmentId: e.id } });
      return {
        id: e.id,
        course: this.view(e.course),
        status: e.status,
        items: e.course.items.map((i) => ({ id: i.id, title: i.title, kind: i.kind, url: i.url, minutes: i.minutes, required: i.required, done: done.has(i.id), hasFile: Boolean(i.fileId) })),
        certificate: cert ? { title: cert.title, issuedOn: cert.issuedOn.toISOString().slice(0, 10), expiresOn: cert.expiresOn?.toISOString().slice(0, 10) ?? null } : null,
      };
    });
  }

  /** I finished an item; when every required item is done the course completes (and the certificate is issued). */
  async done(ctx: TenantContext, user: ScopeUser, id: string, itemId: string) {
    const me = user.userId;
    if (!me || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves records progress.');
    return inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.myEnrolment(tx, c.organizationId, me, id);
      if (e.status !== 'enrolled') throw new ConflictException({ statusCode: 409, code: 'LEARNING_NOT_ENROLLED', message: e.status === 'completed' ? 'You completed this course already.' : 'You are not enrolled in this course.' });
      if (!e.course.items.some((i) => i.id === itemId)) throw new NotFoundException('No such item.');
      await tx.lrnItemProgress.createMany({ data: [{ organizationId: c.organizationId, enrolmentId: e.id, itemId }], skipDuplicates: true });
      const done = new Set([...e.progress.map((p) => p.itemId), itemId]);
      // Classroom and virtual courses complete only through an attended session (G3b close), not by reading the items.
      const complete = e.course.type === 'self_paced' && e.course.items.filter((i) => i.required).every((i) => done.has(i.id));
      const certificate = complete ? await this.complete(tx, c, e, e.course) : null;
      return { progress: progressOf(e.course.items, [...done]), completed: complete, certificate };
    });
  }

  /** Completes an enrolment and issues the course's certificate (valid for its months); shared with sessions (G3b). */
  async complete(tx: Tx, c: CompanyContext, e: { id: string; courseId: string; userId: string }, course: { title: string; certificate: boolean; validMonths: number | null }) {
    const today = todayIst();
    await tx.lrnEnrolment.update({ where: { id: e.id }, data: { status: 'completed', completedAt: new Date() } });
    let certificate = null;
    if (course.certificate) {
      const expires = course.validMonths ? addMonths(today, course.validMonths) : null;
      await tx.lrnCertificate.create({ data: { organizationId: c.organizationId, enrolmentId: e.id, courseId: e.courseId, userId: e.userId, title: course.title, issuedOn: new Date(`${today}T00:00:00Z`), expiresOn: expires ? new Date(`${expires}T00:00:00Z`) : null } });
      certificate = { title: course.title, issuedOn: today, expiresOn: expires };
    }
    await audit(tx, c, 'learning.enrolment.completed', 'lrn_enrolment', e.id, { courseId: e.courseId, certificate: Boolean(certificate) });
    return certificate;
  }

  /** An item's video or PDF, for someone enrolled (or finished); only clean files open. */
  async itemFile(ctx: TenantContext, user: ScopeUser, id: string, itemId: string) {
    const me = user.userId!;
    const row = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.myEnrolment(tx, c.organizationId, me, id);
      if (!['enrolled', 'completed'].includes(e.status)) throw new NotFoundException('No such item.');
      const item = e.course.items.find((i) => i.id === itemId);
      if (!item?.fileId) throw new NotFoundException('No such item.');
      return tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: item.fileId } });
    });
    return { file: await this.files.bytes(row), name: row.fileName, contentType: row.mime };
  }

  /** I decline a nomination with a reason (never a mandatory course; never one I chose myself). */
  async decline(ctx: TenantContext, user: ScopeUser, id: string, reason: string) {
    const me = user.userId;
    if (!me || user.impersonatorUserId || user.actingSuperAdmin) throw new ForbiddenException('Only the person themselves declines.');
    const out = await inCompany(this.tenantPrisma, ctx, async (tx, c) => {
      const e = await this.myEnrolment(tx, c.organizationId, me, id);
      if (e.course.mandatory) throw new ConflictException({ statusCode: 409, code: 'LEARNING_MANDATORY', message: 'A mandatory course can’t be declined. Talk to your manager about the date.' });
      if (e.status !== 'enrolled' || e.source !== 'nominated') throw new ConflictException({ statusCode: 409, code: 'LEARNING_NOT_NOMINATED', message: 'Only an open nomination can be declined.' });
      await tx.lrnEnrolment.update({ where: { id: e.id }, data: { status: 'declined', reason } });
      await audit(tx, c, 'learning.enrolment.declined', 'lrn_enrolment', e.id, { courseId: e.courseId });
      return e;
    });
    if (out.nominatedBy) await this.tell(ctx, [out.nominatedBy], out.courseId, `A nomination for ${out.course.title} was declined: ${reason}`);
    return { status: 'declined' };
  }
}
