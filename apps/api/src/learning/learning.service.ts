import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { CompanyContext, Tx, audit, inCompany } from '../org-structure/org-structure.service';
import { todayIst } from '../org-structure/org-validation';
import { ScopeUser, Viewer, buildViewer, has, implicitSql, inScopeSql, tenantWide } from '../access/scope';
import { FilesService } from '../documents/files.service';
import { registerVerifier, verifyCode, verifyLink } from '../documents/verify-code';
import { ApprovalsEngine, type Notice } from '../workflow/approvals-engine.service';
import { holdersOf } from '../time/time-core';
import { LEARNING_KEYS, asDate, iso, ownEmployee } from './learning-core';
import { addMonths, durationText, progressPct, shownStatus } from './learning-rules';

// Learning for the learner and L&D (LRN-01 My learning and catalogue, LRN-02 course player, LRN-03 course builder):
// published courses are the company's catalogue; a person enrols (or asks, when the course needs approval), works
// through the items, and completes when every required item is done; a course with a certificate issues one with a
// public verify code. L&D (learning.manage) builds courses: content items (PDF, MP4 video, link), required or not,
// in order; publishing needs at least one required item.

const TYPE_LABEL: Record<string, string> = { self_paced: 'Self-paced', classroom: 'Classroom', virtual: 'Virtual', scorm: 'SCORM', assessment: 'Assessment only' };
const KIND_LABEL: Record<string, 'PDF' | 'Video' | 'Link'> = { pdf: 'PDF', video: 'Video', link: 'Link' };
/** Courses that cost more than this carry a 12-month training bond the person accepts when asking (LRN-06). */
export const BOND_ABOVE = 25000;
const REQUEST_TYPE = 'learning.enrolment';
const EXTERNAL_TYPE = 'learning.external';
const MIME: Record<'pdf' | 'video', { mime: string; maxMb: number }> = { pdf: { mime: 'application/pdf', maxMb: 20 }, video: { mime: 'video/mp4', maxMb: 100 } };
type Course = Prisma.LearningCourseGetPayload<object>;

export interface CourseInput {
  title: string;
  description?: string | null;
  source: 'company' | 'provider' | 'partner';
  provider?: string | null;
  durationMinutes: number;
  cost: number;
  mandatory: boolean;
  needsApproval: boolean;
  certificate: boolean;
  certificateMonths?: number | null;
  skills: string[];
}

@Injectable()
export class LearningService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly files: FilesService,
    private readonly engine: ApprovalsEngine,
  ) {}

  /** Certificates answer the public verify page, like letters and payslips; asking for a course is an approval request. */
  onModuleInit() {
    this.engine.register({
      key: REQUEST_TYPE,
      label: 'Course enrolment',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      cardPreview: async () => 'full',
      onDecided: (tx, req, outcome) => this.decided(tx, req, outcome),
      requesterLink: () => '/yx/learning',
    });
    this.engine.register({
      key: EXTERNAL_TYPE,
      label: 'External training',
      risk: 'normal',
      autoActions: false,
      distinctSteps: true,
      cardPreview: async () => 'full',
      onDecided: (tx, req, outcome) => this.externalDecided(tx, req, outcome),
      requesterLink: () => '/yx/learning',
    });
    registerVerifier(async (code) => {
      const r = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
        const cert = await tx.learningCertificate.findUnique({ where: { verifyCode: code } });
        if (!cert) return null;
        const org = await tx.organization.findUnique({ where: { id: cert.organizationId }, select: { name: true } });
        return { cert, company: org?.name ?? '' };
      });
      if (!r) return null;
      const valid = !r.cert.expiresOn || iso(r.cert.expiresOn)! >= todayIst();
      return { company: r.company, kind: `Training certificate: ${r.cert.courseTitle}${valid ? '' : ' (expired)'}`, name: r.cert.personName, issuedOn: iso(r.cert.issuedOn)!, status: 'current' };
    });
  }

  viewer(user: ScopeUser): Promise<Viewer> {
    return buildViewer(this.prisma, this.tenantPrisma, user, LEARNING_KEYS);
  }

  private run<T>(ctx: TenantContext, fn: (tx: Tx, c: CompanyContext) => Promise<T>) {
    return inCompany(this.tenantPrisma, ctx, fn);
  }

  private manager(v: Viewer) {
    if (!tenantWide(v, 'learning.manage') || v.actingForOther) throw new ForbiddenException('Building courses needs learning.manage.');
  }

  courseView(c: Course, company: string) {
    return {
      id: c.id,
      title: c.title,
      description: c.description,
      type: TYPE_LABEL[c.type] ?? c.type,
      source: c.source === 'company' ? company : c.source === 'provider' ? 'Provider' : 'Partner pack',
      provider: c.provider,
      duration: durationText(c.durationMinutes),
      durationMinutes: c.durationMinutes,
      skills: c.skills,
      cost: Number(c.cost),
      mandatory: c.mandatory,
      approval: c.needsApproval,
      certificate: c.certificate,
      certificateMonths: c.certificateMonths,
      status: c.status,
      version: c.version,
    };
  }

  private async company(tx: Tx, c: CompanyContext) {
    return (await tx.organization.findUnique({ where: { id: c.organizationId }, select: { name: true } }))?.name ?? 'Company';
  }

  // ------------------------------------------------------------------------------------------ the learner

  /** LRN-01: my open and finished enrolments, my certificates and the published catalogue. */
  me(ctx: TenantContext) {
    return this.run(ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      const company = await this.company(tx, c);
      const today = todayIst();
      const catalogue = (await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, status: 'published' }, orderBy: { title: 'asc' } })).map((x) => this.courseView(x, company));
      if (!me) return { today, employee: false, enrolments: [], certificates: [], catalogue, external: [] };
      const external = (await tx.learningExternalRequest.findMany({ where: { organizationId: c.organizationId, employeeId: me, status: { in: ['requested', 'approved'] } }, orderBy: { createdAt: 'desc' } })).map((x) => ({ id: x.id, title: x.title, provider: x.provider, cost: Number(x.cost), status: x.status === 'approved' ? 'Approved' : 'Requested', requested: iso(x.createdAt)! }));
      return { today, employee: true, enrolments: await this.enrolmentsOf(tx, c, me, today, company), certificates: await this.certificatesOf(tx, c, me), catalogue, external };
    });
  }

  private async enrolmentsOf(tx: Tx, c: CompanyContext, employeeId: string, today: string, company: string) {
    const rows = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, employeeId, status: { notIn: ['cancelled', 'declined'] } }, orderBy: [{ dueOn: 'asc' }, { createdAt: 'desc' }] });
    const courses = await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, id: { in: [...new Set(rows.map((r) => r.courseId))] } } });
    const req = await this.requiredCounts(tx, c, rows.map((r) => r.id), courses.map((x) => x.id));
    return rows.flatMap((r) => {
      const course = courses.find((x) => x.id === r.courseId);
      if (!course) return [];
      const done = req.done.get(r.id) ?? 0;
      const total = req.total.get(r.courseId) ?? 0;
      return [{ id: r.id, course: this.courseView(course, company), status: shownStatus({ status: r.status, dueOn: iso(r.dueOn) }, today), source: SOURCE_LABEL[r.source] ?? r.source, due: iso(r.dueOn), progress: r.status === 'completed' ? 100 : progressPct(done, total), completedOn: iso(r.completedAt) }];
    });
  }

  private async requiredCounts(tx: Tx, c: CompanyContext, enrolmentIds: string[], courseIds: string[]) {
    const items = courseIds.length ? await tx.learningCourseItem.findMany({ where: { organizationId: c.organizationId, courseId: { in: courseIds }, required: true }, select: { id: true, courseId: true } }) : [];
    const total = new Map<string, number>();
    for (const i of items) total.set(i.courseId, (total.get(i.courseId) ?? 0) + 1);
    const progress = enrolmentIds.length ? await tx.learningItemProgress.findMany({ where: { organizationId: c.organizationId, enrolmentId: { in: enrolmentIds }, itemId: { in: items.map((i) => i.id) } } }) : [];
    const done = new Map<string, number>();
    for (const p of progress) done.set(p.enrolmentId, (done.get(p.enrolmentId) ?? 0) + 1);
    return { total, done };
  }

  private async certificatesOf(tx: Tx, c: CompanyContext, employeeId: string) {
    const rows = await tx.learningCertificate.findMany({ where: { organizationId: c.organizationId, employeeId }, orderBy: { issuedOn: 'desc' } });
    // A renewal enrolled for an expiring certificate (YX-LRN-05) shows on it.
    const open = await tx.learningEnrolment.findMany({ where: { organizationId: c.organizationId, employeeId, source: 'renewal', status: { in: ['enrolled', 'in_progress'] } }, select: { courseId: true, assignedOn: true } });
    const latest = new Set<string>();
    return rows.flatMap((r) => {
      if (latest.has(r.courseId)) return [];
      latest.add(r.courseId);
      return [{ id: r.id, title: r.courseTitle, issued: iso(r.issuedOn)!, expires: iso(r.expiresOn), renewal: iso(open.find((o) => o.courseId === r.courseId)?.assignedOn) }];
    });
  }

  /**
   * Enrol myself in a published course, or ask when it needs approval (LRN-06): the request goes to my manager, then to
   * L&D (learning.manage over me; the company's admins when nobody holds it). Above the bond threshold I accept the bond.
   */
  async enrol(ctx: TenantContext, courseId: string, opts: { acceptBond?: boolean } = {}) {
    let notices: Notice[] = [];
    const out = await this.run(ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      if (!me) throw new ForbiddenException('Only employees enrol in courses.');
      const course = await tx.learningCourse.findFirst({ where: { organizationId: c.organizationId, id: courseId, status: 'published' } });
      if (!course) throw new NotFoundException('No such course.');
      const bond = Number(course.cost) > BOND_ABOVE;
      if (bond && !opts.acceptBond) throw new BadRequestException('Accept the training bond terms to continue.');
      const status = course.needsApproval ? 'requested' : 'enrolled';
      let e: Prisma.LearningEnrolmentGetPayload<object>;
      try {
        e = await tx.learningEnrolment.create({ data: { organizationId: c.organizationId, employeeId: me, courseId, source: 'self', assignedOn: asDate(todayIst()), status, bondAcceptedAt: bond ? new Date() : null, createdBy: c.userId ?? null } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException(`You are already enrolled in ${course.title}.`);
        throw err;
      }
      if (status === 'requested') {
        const sub = await this.request(tx, c, me, REQUEST_TYPE, 'learning_enrolment', e.id, course.title, [
          { label: 'Course', value: `${course.title} (${TYPE_LABEL[course.type] ?? course.type}, ${durationText(course.durationMinutes)})` },
          { label: 'Cost', value: Number(course.cost) ? `₹${Number(course.cost).toLocaleString('en-IN')}` : 'No cost' },
          ...(bond ? [{ label: 'Training bond', value: '12 months, accepted' }] : []),
        ]);
        await tx.learningEnrolment.update({ where: { id: e.id }, data: { wfRequestId: sub.id } });
        notices = sub.notices;
      }
      await audit(tx, c, status === 'requested' ? 'learning.enrolment.requested' : 'learning.enrolled', 'learning_enrolment', e.id, { course: course.title, ...(bond ? { bond: true } : {}) });
      return { id: e.id, status: status === 'requested' ? 'Requested' : 'Enrolled' };
    });
    if (notices.length) await this.engine.send(ctx, notices);
    return out;
  }

  /**
   * The approval route for something I ask for: my manager, then L&D (learning.manage over me; the company's admins when
   * nobody holds it). Never the person themselves.
   */
  private async request(tx: Tx, c: CompanyContext, me: string, type: string, subjectType: string, subjectId: string, what: string, summary: { label: string; value: string }[]) {
    const today = todayIst();
    const person = await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: me }, select: { personId: true, givenName: true, familyName: true, preferredName: true } });
    let ld = (await holdersOf(tx, c.organizationId, 'learning.manage', me, today)).filter((u) => u !== c.userId);
    if (!ld.length) ld = (await tx.user.findMany({ where: { organizationId: c.organizationId, role: 'org_admin', status: 'active' }, select: { id: true }, take: 25 })).map((u) => u.id).filter((u) => u !== c.userId);
    if (!ld.length) throw new ConflictException('No one in L&D can approve training yet. Ask an admin to grant learning.manage.');
    const name = person.preferredName || [person.givenName, person.familyName].filter(Boolean).join(' ');
    return this.engine.submit(tx, c, {
      type,
      subjectType,
      subjectId,
      title: `${name}: ${what}`,
      summary,
      subjectPersonId: person.personId,
      requesterUserId: c.userId ?? null,
      raisedByUserId: c.userId ?? null,
      steps: [
        { name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', selfApproval: 'never' },
        { name: 'L&D', approvers: [{ kind: 'users', userIds: ld.slice(0, 25) }], mode: 'any', selfApproval: 'never' },
      ],
      payload: {},
      payloadFields: [],
      fallbackUserIds: ld,
    });
  }

  /** LRN-06 external: a course or certification outside the catalogue, with its provider, fees and why it helps. */
  async external(ctx: TenantContext, dto: { title: string; provider: string; cost: number; reason: string; acceptBond?: boolean }) {
    let notices: Notice[] = [];
    const out = await this.run(ctx, async (tx, c) => {
      const me = await ownEmployee(tx, c);
      if (!me) throw new ForbiddenException('Only employees ask for training.');
      const bond = dto.cost > BOND_ABOVE;
      if (bond && !dto.acceptBond) throw new BadRequestException('Accept the training bond terms to continue.');
      const x = await tx.learningExternalRequest.create({ data: { organizationId: c.organizationId, employeeId: me, title: dto.title.trim(), provider: dto.provider.trim(), cost: dto.cost, reason: dto.reason.trim(), bondAcceptedAt: bond ? new Date() : null, createdBy: c.userId ?? null } });
      const sub = await this.request(tx, c, me, EXTERNAL_TYPE, 'learning_external_request', x.id, `${x.title} (external)`, [
        { label: 'Training', value: `${x.title}, ${x.provider}` },
        { label: 'Fees', value: `₹${dto.cost.toLocaleString('en-IN')}` },
        { label: 'Why', value: x.reason.slice(0, 300) },
        ...(bond ? [{ label: 'Training bond', value: '12 months, accepted' }] : []),
      ]);
      await tx.learningExternalRequest.update({ where: { id: x.id }, data: { wfRequestId: sub.id } });
      notices = sub.notices;
      await audit(tx, c, 'learning.external.requested', 'learning_external_request', x.id, { title: x.title, provider: x.provider, cost: dto.cost });
      return { id: x.id, status: 'Requested' };
    });
    if (notices.length) await this.engine.send(ctx, notices);
    return out;
  }

  private async externalDecided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const x = await tx.learningExternalRequest.findFirst({ where: { organizationId: org, wfRequestId: req.id } });
    if (!x || x.status !== 'requested') return;
    await tx.learningExternalRequest.update({ where: { id: x.id }, data: { status: outcome === 'approved' ? 'approved' : 'declined', decidedAt: new Date() } });
    await audit(tx, { organizationId: org, isSuperAdmin: false, userId: null }, `learning.external.${outcome === 'approved' ? 'approved' : 'declined'}`, 'learning_external_request', x.id, {});
  }

  /** The approvals engine decided a request: approved enrols the person from today; refused leaves it declined. */
  private async decided(tx: Tx, req: Prisma.WfRequestGetPayload<object>, outcome: 'approved' | 'rejected') {
    const org = req.organizationId;
    const e = await tx.learningEnrolment.findFirst({ where: { organizationId: org, wfRequestId: req.id } });
    if (!e || e.status !== 'requested') return;
    const c: CompanyContext = { organizationId: org, isSuperAdmin: false, userId: null };
    await tx.learningEnrolment.update({ where: { id: e.id }, data: outcome === 'approved' ? { status: 'enrolled', assignedOn: asDate(todayIst()), version: { increment: 1 } } : { status: 'declined', version: { increment: 1 } } });
    await audit(tx, c, outcome === 'approved' ? 'learning.enrolment.approved' : 'learning.enrolment.declined', 'learning_enrolment', e.id, {});
  }

  /** LRN-02: my enrolment with the course outline, what is done, and the certificate once complete. */
  player(ctx: TenantContext, enrolmentId: string) {
    return this.run(ctx, async (tx, c) => {
      const e = await this.mine(tx, c, enrolmentId);
      const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: e.courseId } });
      const items = await tx.learningCourseItem.findMany({ where: { organizationId: c.organizationId, courseId: course.id }, orderBy: { position: 'asc' } });
      const done = new Set((await tx.learningItemProgress.findMany({ where: { organizationId: c.organizationId, enrolmentId: e.id } })).map((p) => p.itemId));
      const cert = await tx.learningCertificate.findUnique({ where: { enrolmentId: e.id } });
      return {
        enrolment: { id: e.id, status: shownStatus({ status: e.status, dueOn: iso(e.dueOn) }, todayIst()), due: iso(e.dueOn), version: e.version },
        course: this.courseView(course, await this.company(tx, c)),
        items: items.map((i) => ({ id: i.id, title: i.title, kind: KIND_LABEL[i.kind], minutes: i.minutes, required: i.required, done: done.has(i.id), url: i.kind === 'link' ? i.url : null })),
        certificate: cert ? { id: cert.id, issued: iso(cert.issuedOn), expires: iso(cert.expiresOn) } : null,
      };
    });
  }

  private async mine(tx: Tx, c: CompanyContext, enrolmentId: string) {
    const me = await ownEmployee(tx, c);
    const e = me ? await tx.learningEnrolment.findFirst({ where: { organizationId: c.organizationId, id: enrolmentId, employeeId: me } }) : null;
    if (!e) throw new NotFoundException('No such enrolment.');
    return e;
  }

  /** An item done: the enrolment starts; with every required item done it completes and the certificate is issued. */
  markDone(ctx: TenantContext, enrolmentId: string, itemId: string) {
    return this.run(ctx, async (tx, c) => {
      const e = await this.mine(tx, c, enrolmentId);
      if (e.status === 'requested') throw new ConflictException('This course is waiting for approval.');
      if (e.status === 'cancelled') throw new ConflictException('This enrolment was cancelled.');
      const item = await tx.learningCourseItem.findFirst({ where: { organizationId: c.organizationId, id: itemId, courseId: e.courseId } });
      if (!item) throw new NotFoundException('No such item in this course.');
      if (e.status === 'completed') return { completed: true, certificateId: (await tx.learningCertificate.findUnique({ where: { enrolmentId: e.id } }))?.id ?? null };
      await tx.learningItemProgress.upsert({ where: { enrolmentId_itemId: { enrolmentId: e.id, itemId } }, create: { organizationId: c.organizationId, enrolmentId: e.id, itemId }, update: {} });
      const required = await tx.learningCourseItem.findMany({ where: { organizationId: c.organizationId, courseId: e.courseId, required: true }, select: { id: true } });
      const done = await tx.learningItemProgress.count({ where: { organizationId: c.organizationId, enrolmentId: e.id, itemId: { in: required.map((r) => r.id) } } });
      if (required.length && done >= required.length) return { completed: true, certificateId: await this.complete(tx, c, e.id) };
      // Optimistic: one change at a time on the enrolment.
      const moved = await tx.learningEnrolment.updateMany({ where: { id: e.id, version: e.version }, data: { status: 'in_progress', startedAt: e.startedAt ?? new Date(), version: { increment: 1 } } });
      if (!moved.count) throw new ConflictException('This course changed. Reload it.');
      return { completed: false, certificateId: null };
    });
  }

  private async complete(tx: Tx, c: CompanyContext, enrolmentId: string): Promise<string | null> {
    const today = todayIst();
    const e = await tx.learningEnrolment.findFirstOrThrow({ where: { organizationId: c.organizationId, id: enrolmentId } });
    const moved = await tx.learningEnrolment.updateMany({ where: { id: e.id, version: e.version, status: { in: ['enrolled', 'in_progress'] } }, data: { status: 'completed', startedAt: e.startedAt ?? new Date(), completedAt: new Date(), version: { increment: 1 } } });
    if (!moved.count) throw new ConflictException('This course changed. Reload it.');
    const course = await tx.learningCourse.findFirstOrThrow({ where: { organizationId: c.organizationId, id: e.courseId } });
    await audit(tx, c, 'learning.completed', 'learning_enrolment', e.id, { course: course.title });
    if (!course.certificate) return null;
    const person = await tx.employee.findFirstOrThrow({ where: { organizationId: c.organizationId, id: e.employeeId }, select: { givenName: true, familyName: true, preferredName: true } });
    const cert = await tx.learningCertificate.create({
      data: {
        organizationId: c.organizationId,
        enrolmentId: e.id,
        employeeId: e.employeeId,
        courseId: course.id,
        courseTitle: course.title,
        personName: [person.givenName, person.familyName].filter(Boolean).join(' '),
        issuedOn: asDate(today),
        expiresOn: course.certificateMonths ? asDate(addMonths(today, course.certificateMonths)) : null,
        verifyCode: verifyCode(),
      },
    });
    await audit(tx, c, 'learning.certificate.issued', 'learning_certificate', cert.id, { course: course.title });
    return cert.id;
  }

  /** The file of a PDF or video item: for someone enrolled in its course, or L&D. */
  itemFile(ctx: TenantContext, user: ScopeUser, itemId: string) {
    return this.viewer(user).then((v) =>
      this.run(ctx, async (tx, c) => {
        const item = await tx.learningCourseItem.findFirst({ where: { organizationId: c.organizationId, id: itemId } });
        if (!item?.fileId) throw new NotFoundException('No such item.');
        const me = await ownEmployee(tx, c);
        const enrolled = me ? await tx.learningEnrolment.count({ where: { organizationId: c.organizationId, employeeId: me, courseId: item.courseId, status: { in: ['enrolled', 'in_progress', 'completed'] } } }) : 0;
        if (!enrolled && !(tenantWide(v, 'learning.manage') && !v.actingForOther)) throw new NotFoundException('No such item.');
        const file = await tx.file.findFirstOrThrow({ where: { organizationId: c.organizationId, id: item.fileId } });
        return { name: file.fileName, mime: file.mime, data: await this.files.bytes(file) };
      }),
    );
  }

  /** A certificate as a PDF: for its holder, L&D, or someone whose learning.report.view reaches the holder. */
  certificatePdf(ctx: TenantContext, user: ScopeUser, certificateId: string) {
    return this.viewer(user).then((v) =>
      this.run(ctx, async (tx, c) => {
        const cert = await tx.learningCertificate.findFirst({ where: { organizationId: c.organizationId, id: certificateId } });
        if (!cert) throw new NotFoundException('No such certificate.');
        const me = await ownEmployee(tx, c);
        if (cert.employeeId !== me) {
          const today = todayIst();
          const [row] = has(v, 'learning.report.view') && !v.actingForOther ? await tx.$queryRaw<{ ok: boolean }[]>`SELECT ${inScopeSql(c, v, 'learning.report.view', Prisma.sql`${cert.employeeId}::uuid`, Prisma.sql`${today}::date`, me)} AS ok` : [];
          const team = me ? (await tx.$queryRaw<{ ok: boolean }[]>`SELECT ${await implicitSql(tx, c, me, Prisma.sql`${cert.employeeId}::uuid`, Prisma.sql`${today}::date`)} AS ok`)[0]?.ok : false;
          if (!row?.ok && !team && !(tenantWide(v, 'learning.manage') && !v.actingForOther)) throw new NotFoundException('No such certificate.');
          await audit(tx, c, 'learning.certificate.viewed', 'learning_certificate', cert.id, {});
        }
        return { name: `${cert.courseTitle} - ${cert.personName}.pdf`.replace(/[\\/:*?"<>|]/g, ' '), data: await renderCertificate(cert, await this.company(tx, c)) };
      }),
    );
  }

  // ------------------------------------------------------------------------------------------ L&D: courses (LRN-03)

  /** Every course with its status, for the builder list. */
  courses(ctx: TenantContext, user: ScopeUser) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      return this.run(ctx, async (tx, c) => {
        const company = await this.company(tx, c);
        const rows = await tx.learningCourse.findMany({ where: { organizationId: c.organizationId, status: { not: 'retired' } }, orderBy: { title: 'asc' } });
        const items = await tx.learningCourseItem.groupBy({ by: ['courseId'], where: { organizationId: c.organizationId, courseId: { in: rows.map((r) => r.id) } }, _count: { _all: true } });
        const learners = await tx.learningEnrolment.groupBy({ by: ['courseId'], where: { organizationId: c.organizationId, courseId: { in: rows.map((r) => r.id) }, status: { in: ['enrolled', 'in_progress', 'completed'] } }, _count: { _all: true } });
        return rows.map((r) => ({ ...this.courseView(r, company), items: items.find((i) => i.courseId === r.id)?._count._all ?? 0, learners: learners.find((i) => i.courseId === r.id)?._count._all ?? 0 }));
      });
    });
  }

  /** One course with its items, for the builder. */
  course(ctx: TenantContext, user: ScopeUser, courseId: string) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      return this.run(ctx, async (tx, c) => {
        const course = await tx.learningCourse.findFirst({ where: { organizationId: c.organizationId, id: courseId } });
        if (!course) throw new NotFoundException('No such course.');
        const items = await tx.learningCourseItem.findMany({ where: { organizationId: c.organizationId, courseId }, orderBy: { position: 'asc' } });
        const files = await tx.file.findMany({ where: { organizationId: c.organizationId, id: { in: items.flatMap((i) => (i.fileId ? [i.fileId] : [])) } }, select: { id: true, fileName: true, scanStatus: true } });
        return {
          course: this.courseView(course, await this.company(tx, c)),
          items: items.map((i) => ({ id: i.id, title: i.title, kind: KIND_LABEL[i.kind], minutes: i.minutes, required: i.required, url: i.url, file: files.find((f) => f.id === i.fileId)?.fileName ?? null })),
        };
      });
    });
  }

  createCourse(ctx: TenantContext, user: ScopeUser, dto: CourseInput) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      this.checkCourse(dto);
      return this.run(ctx, async (tx, c) => {
        try {
          const course = await tx.learningCourse.create({ data: { organizationId: c.organizationId, ...this.courseData(dto), createdBy: c.userId ?? null } });
          await audit(tx, c, 'learning.course.created', 'learning_course', course.id, { title: course.title });
          return { id: course.id };
        } catch (e) {
          throw this.duplicate(e, dto.title);
        }
      });
    });
  }

  updateCourse(ctx: TenantContext, user: ScopeUser, courseId: string, dto: CourseInput & { version: number }) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      this.checkCourse(dto);
      return this.run(ctx, async (tx, c) => {
        try {
          const moved = await tx.learningCourse.updateMany({ where: { organizationId: c.organizationId, id: courseId, version: dto.version, status: { not: 'retired' } }, data: { ...this.courseData(dto), updatedAt: new Date(), version: { increment: 1 } } });
          if (!moved.count) throw new ConflictException('Someone else changed this course. Reload it.');
        } catch (e) {
          throw this.duplicate(e, dto.title);
        }
        await audit(tx, c, 'learning.course.updated', 'learning_course', courseId, { title: dto.title });
        return { ok: true };
      });
    });
  }

  private checkCourse(dto: CourseInput) {
    if (dto.source !== 'company' && !dto.provider?.trim()) throw new BadRequestException('Name the provider.');
    if (dto.certificate && dto.certificateMonths != null && (dto.certificateMonths < 1 || dto.certificateMonths > 120)) throw new BadRequestException('A certificate is valid for 1 to 120 months.');
  }

  private courseData(dto: CourseInput) {
    return {
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      source: dto.source,
      provider: dto.source === 'company' ? null : dto.provider!.trim(),
      durationMinutes: dto.durationMinutes,
      cost: dto.cost,
      mandatory: dto.mandatory,
      needsApproval: dto.needsApproval,
      certificate: dto.certificate,
      certificateMonths: dto.certificate ? (dto.certificateMonths ?? null) : null,
      skills: [...new Set(dto.skills.map((s) => s.trim()).filter(Boolean))],
    };
  }

  private duplicate(e: unknown, title: string) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException(`A course called ${title} already exists.`);
    return e;
  }

  /** A link item, or a PDF / MP4 video item with its file (stored and scanned like every upload). */
  addItem(ctx: TenantContext, user: ScopeUser, courseId: string, dto: { title: string; kind: 'pdf' | 'video' | 'link'; minutes: number; required: boolean; url?: string | null }, file?: { originalname: string; buffer: Buffer }) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      if (dto.kind === 'link' ? !dto.url || file : !file) throw new BadRequestException(dto.kind === 'link' ? 'Give the link address.' : 'Choose the file to upload.');
      if (dto.kind === 'link' && !/^https:\/\/[^\s]+$/i.test(dto.url!)) throw new BadRequestException('A link must start with https://.');
      let stored: string | null = null;
      return this.run(ctx, async (tx, c) => {
        const course = await tx.learningCourse.findFirst({ where: { organizationId: c.organizationId, id: courseId, status: { not: 'retired' } } });
        if (!course) throw new NotFoundException('No such course.');
        const last = await tx.learningCourseItem.findFirst({ where: { organizationId: c.organizationId, courseId }, orderBy: { position: 'desc' }, select: { position: true } });
        const fileId = file && dto.kind !== 'link' ? (await this.files.storeIn(tx, c, { area: 'learning', name: file.originalname, data: file.buffer, allowedMime: [MIME[dto.kind].mime], maxMb: MIME[dto.kind].maxMb, via: 'staff' })).id : null;
        stored = fileId;
        const item = await tx.learningCourseItem.create({ data: { organizationId: c.organizationId, courseId, position: (last?.position ?? 0) + 1, title: dto.title.trim(), kind: dto.kind, minutes: dto.minutes, required: dto.required, fileId, url: dto.kind === 'link' ? dto.url!.trim() : null } });
        await audit(tx, c, 'learning.course.item_added', 'learning_course', courseId, { item: item.title, kind: dto.kind });
        return { id: item.id };
      }).then(async (out) => {
        if (stored) void this.files.scan(ctx.organizationId!, stored).catch(() => undefined);
        return out;
      });
    });
  }

  /** Required or not, the title and minutes, or one place up or down. */
  updateItem(ctx: TenantContext, user: ScopeUser, courseId: string, itemId: string, dto: { required?: boolean; title?: string; minutes?: number; move?: 'up' | 'down' }) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      return this.run(ctx, async (tx, c) => {
        const items = await tx.learningCourseItem.findMany({ where: { organizationId: c.organizationId, courseId }, orderBy: { position: 'asc' } });
        const i = items.findIndex((x) => x.id === itemId);
        if (i < 0) throw new NotFoundException('No such item.');
        if (dto.move) {
          const j = dto.move === 'up' ? i - 1 : i + 1;
          if (j < 0 || j >= items.length) return { ok: true };
          await tx.learningCourseItem.update({ where: { id: items[i].id }, data: { position: items[j].position } });
          await tx.learningCourseItem.update({ where: { id: items[j].id }, data: { position: items[i].position } });
        } else {
          await tx.learningCourseItem.update({ where: { id: itemId }, data: { ...(dto.required !== undefined ? { required: dto.required } : {}), ...(dto.title ? { title: dto.title.trim() } : {}), ...(dto.minutes !== undefined ? { minutes: dto.minutes } : {}) } });
        }
        await audit(tx, c, 'learning.course.item_changed', 'learning_course', courseId, { item: items[i].title, ...dto });
        return { ok: true };
      });
    });
  }

  /** An item can go while nobody has done it; after that it stays (completions point to it). */
  removeItem(ctx: TenantContext, user: ScopeUser, courseId: string, itemId: string) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      return this.run(ctx, async (tx, c) => {
        const item = await tx.learningCourseItem.findFirst({ where: { organizationId: c.organizationId, courseId, id: itemId } });
        if (!item) throw new NotFoundException('No such item.');
        if (await tx.learningItemProgress.count({ where: { organizationId: c.organizationId, itemId } })) throw new ConflictException(`${item.title} has been done by learners, so it stays. Make it optional instead.`);
        await tx.learningCourseItem.delete({ where: { id: itemId } });
        await audit(tx, c, 'learning.course.item_removed', 'learning_course', courseId, { item: item.title });
        return { ok: true };
      });
    });
  }

  /** Publish: the course needs a required item so completion can be checked (LRN-03). Retire: off the catalogue. */
  setStatus(ctx: TenantContext, user: ScopeUser, courseId: string, status: 'published' | 'retired', version: number) {
    return this.viewer(user).then((v) => {
      this.manager(v);
      return this.run(ctx, async (tx, c) => {
        const course = await tx.learningCourse.findFirst({ where: { organizationId: c.organizationId, id: courseId } });
        if (!course) throw new NotFoundException('No such course.');
        if (status === 'published' && !(await tx.learningCourseItem.count({ where: { organizationId: c.organizationId, courseId, required: true } }))) throw new BadRequestException('Mark at least one item as required before publishing.');
        if (status === 'retired' && (await tx.learningRule.count({ where: { organizationId: c.organizationId, courseId, active: true } }))) throw new ConflictException('An active assignment rule uses this course. Pause the rule first.');
        const moved = await tx.learningCourse.updateMany({ where: { id: courseId, version }, data: { status, updatedAt: new Date(), version: { increment: 1 } } });
        if (!moved.count) throw new ConflictException('Someone else changed this course. Reload it.');
        await audit(tx, c, `learning.course.${status}`, 'learning_course', courseId, { title: course.title });
        return { ok: true };
      });
    });
  }
}

const SOURCE_LABEL: Record<string, string> = { rule: 'Assigned by rule', renewal: 'Assigned by rule', self: 'Self', nominated: 'Nominated' };

/** The certificate: company, the person, the course, when and until when, and the public verify code. */
function renderCertificate(cert: Prisma.LearningCertificateGetPayload<object>, company: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 60, info: { Title: `${cert.courseTitle}: ${cert.personName}` } });
    const out: Buffer[] = [];
    doc.on('data', (b: Buffer) => out.push(b)).on('end', () => resolve(Buffer.concat(out))).on('error', reject);
    const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    doc.fontSize(14).fillColor('#555').text(company, { align: 'center' }).moveDown(1.5);
    doc.fontSize(30).fillColor('#111').text('Certificate of completion', { align: 'center' }).moveDown(1);
    doc.fontSize(14).fillColor('#555').text('This certifies that', { align: 'center' }).moveDown(0.5);
    doc.fontSize(24).fillColor('#111').text(cert.personName, { align: 'center' }).moveDown(0.5);
    doc.fontSize(14).fillColor('#555').text('completed', { align: 'center' }).moveDown(0.5);
    doc.fontSize(20).fillColor('#111').text(cert.courseTitle, { align: 'center' }).moveDown(1.5);
    doc.fontSize(12).fillColor('#333').text(`Issued on ${day(cert.issuedOn)}${cert.expiresOn ? ` · valid until ${day(cert.expiresOn)}` : ''}`, { align: 'center' }).moveDown(2);
    doc.fontSize(10).fillColor('#555').text(`Check this certificate: ${verifyLink(cert.verifyCode)} (code ${cert.verifyCode})`, { align: 'center' });
    doc.end();
  });
}
