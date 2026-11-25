process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { FilesService } from '../src/documents/files.service';

// Batch G3 (M07 Learning), end to end against the real database (forced RLS, the app role): G3a courses: the key, the
// builder (links, files, skills, publish), the catalogue, enrolling and asking, nominating (a manager's own reports
// only; L&D anyone), declining (never mandatory), progress, completion and certificates; two companies kept apart.
describe('Batch G3 Learning', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let files: FilesService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'mgr' | 'r1' | 'r2' | 'emp' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
  const COURSE = { title: 'Food safety basics', type: 'self_paced', durationMinutes: 45, cost: 0, mandatory: false, needsApproval: false, certificate: true, validMonths: 12, skills: [] as { skillId: string; level: number }[], items: [{ title: 'Hygiene rules', kind: 'link', url: 'https://example.com/hygiene', minutes: 10, required: true }] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    files = moduleRef.get(FilesService);

    planId = (await prisma.plan.create({ data: { name: `lrn-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `LRN Org ${k}`, slug: `lrn-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', 'hr_admin'],
      ['mgr', 'A', 'panel', null],
      ['r1', 'A', 'panel', null],
      ['r2', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${tpl}-${run}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === tpl)!.permissions) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@lrn-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@lrn-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'LRN Foods', shortName: `LR-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const dept = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: dept, name: 'Quality', code: 'QA', path: `/${dept}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      const domain = await tx.companySkill.create({ data: { ...o, name: `Food ${run}`, kind: 'domain' } });
      ids.skill = (await tx.companySkill.create({ data: { ...o, name: `Hygiene ${run}`, kind: 'skill', parentId: domain.id } })).id;
    });
    const hire = async (who: Who, manager: string | null) =>
      (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[who], workEmail: `${who}@lrn-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    ids.mgrEmp = await hire('mgr', null);
    await hire('r1', ids.mgrEmp);
    await hire('r2', ids.mgrEmp);
    await hire('emp', null);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('G3a: courses', () => {
    it('only learning.manage (System Admin and HR by default) builds courses; the builder refuses what it must', async () => {
      await api('emp', 'get', '/learning/courses').expect(403);
      await api('mgr', 'post', '/learning/courses').send(COURSE).expect(403);
      expect((await api('hr', 'get', '/learning/courses/skills').expect(200)).body.map((s: { id: string }) => s.id)).toContain(ids.skill);
      const bad = (body: object) => api('hr', 'post', '/learning/courses').send({ ...COURSE, ...body }).expect(400);
      await bad({ title: 'ab' });
      await bad({ items: [{ title: 'No link', kind: 'link', minutes: 5, required: true }] });
      await bad({ items: [{ title: 'Plain', kind: 'link', url: 'http://example.com', minutes: 5, required: true }] });
      await bad({ items: [{ title: 'A video', kind: 'video', minutes: 5, required: true }] });
      await bad({ certificate: false, validMonths: 6 });
      await bad({ skills: [{ skillId: randomUUID(), level: 3 }] });
      await bad({ skills: [{ skillId: ids.skill, level: 6 }] });
      await bad({ extra: 1 });
    });

    it('a draft gets links and files, maps a skill and is published only with a required item', async () => {
      const c = (await api('hr', 'post', '/learning/courses').send({ ...COURSE, skills: [{ skillId: ids.skill, level: 3 }], items: [{ title: 'Optional reading', kind: 'link', url: 'https://example.com/read', minutes: 5, required: false }] }).expect(201)).body;
      ids.course = c.id;
      expect((await api('hr', 'post', `/learning/courses/${c.id}/publish`).expect(400)).body.message).toMatch(/required/);
      await api('hr', 'post', `/learning/courses/${c.id}/files`).field('title', 'Hand washing').field('minutes', '8').attach('file', Buffer.from('not a pdf'), 'x.pdf').expect(400);
      const f = (await api('hr', 'post', `/learning/courses/${c.id}/files`).field('title', 'Hand washing').field('minutes', '8').attach('file', PDF, 'hands.pdf').expect(201)).body;
      const d = (await api('hr', 'get', `/learning/courses/${c.id}`).expect(200)).body;
      expect(d.items.map((i: { title: string; kind: string; required: boolean }) => [i.title, i.kind, i.required])).toEqual([['Optional reading', 'link', false], ['Hand washing', 'pdf', true]]);
      const items = d.items.map((i: { id: string; title: string; kind: string; url: string | null; minutes: number; required: boolean }) => ({ id: i.id, title: i.title, kind: i.kind, ...(i.url ? { url: i.url } : {}), minutes: i.minutes, required: i.required }));
      await api('hr', 'put', `/learning/courses/${c.id}`).send({ ...COURSE, skills: [{ skillId: ids.skill, level: 3 }], items: [...items, { title: 'Allergen video', kind: 'link', url: 'https://example.com/allergens', minutes: 6, required: true }] }).expect(200);
      await api('hr', 'put', `/learning/courses/${c.id}`).send({ ...COURSE, items: [{ ...items[1], id: randomUUID() }] }).expect(400);
      await api('hr', 'post', `/learning/courses/${c.id}/publish`).expect(201);
      await api('hr', 'post', `/learning/courses/${c.id}/publish`).expect(409);
      ids.fileItem = f.id;
      // Another, mandatory and needing no approval; and one that needs approval.
      ids.mandatory = (await api('hr', 'post', '/learning/courses').send({ ...COURSE, title: 'POSH awareness', mandatory: true, certificate: false, validMonths: undefined }).expect(201)).body.id;
      await api('hr', 'post', `/learning/courses/${ids.mandatory}/publish`).expect(201);
      ids.approval = (await api('hr', 'post', '/learning/courses').send({ ...COURSE, title: 'Auditor prep', cost: 30000, needsApproval: true, certificate: false, validMonths: undefined }).expect(201)).body.id;
      await api('hr', 'post', `/learning/courses/${ids.approval}/publish`).expect(201);
      ids.draft = (await api('hr', 'post', '/learning/courses').send({ ...COURSE, title: 'Not yet' }).expect(201)).body.id;
    });

    it('the catalogue shows published courses only; enrolling is straight in, or a request when approval is needed', async () => {
      const mine = (await api('emp', 'get', '/learning/my').expect(200)).body;
      expect(mine.catalogue.map((c: { title: string }) => c.title).sort()).toEqual(['Auditor prep', 'Food safety basics', 'POSH awareness']);
      await api('emp', 'post', `/learning/my/courses/${ids.draft}/enrol`).expect(404);
      const e = (await api('emp', 'post', `/learning/my/courses/${ids.course}/enrol`).expect(201)).body;
      expect(e.status).toBe('enrolled');
      ids.empEnrol = e.id;
      expect((await api('emp', 'post', `/learning/my/courses/${ids.course}/enrol`).expect(409)).body.code).toBe('LEARNING_ALREADY');
      const r = (await api('emp', 'post', `/learning/my/courses/${ids.approval}/enrol`).expect(201)).body;
      expect(r.status).toBe('requested');
      await api('emp', 'get', `/learning/my/enrolments/${r.id}`).expect(409);
      // L&D decides: a refusal needs a reason; once only.
      await api('hr', 'post', `/learning/courses/enrolments/${r.id}/decide`).send({ approve: false }).expect(400);
      await api('mgr', 'post', `/learning/courses/enrolments/${r.id}/decide`).send({ approve: true }).expect(403);
      await api('hr', 'post', `/learning/courses/enrolments/${r.id}/decide`).send({ approve: true }).expect(201);
      await api('hr', 'post', `/learning/courses/enrolments/${r.id}/decide`).send({ approve: true }).expect(409);
      expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.emp, type: 'learning.enrolment.update' } }))).toBe(1);
    });

    it('progress: items done one by one; the file opens only to the learner; completion issues the certificate', async () => {
      const p = (await api('emp', 'get', `/learning/my/enrolments/${ids.empEnrol}`).expect(200)).body;
      expect(p.items.map((i: { required: boolean }) => i.required)).toEqual([false, true, true]);
      await api('r1', 'get', `/learning/my/enrolments/${ids.empEnrol}`).expect(404);
      await api('r1', 'post', `/learning/my/enrolments/${ids.empEnrol}/items/${p.items[1].id}/done`).expect(404);
      await files.scan(org.A.id, (await inA((tx) => tx.lrnCourseItem.findFirstOrThrow({ where: { id: p.items[1].id } }))).fileId!);
      const pdf = await api('emp', 'get', `/learning/my/enrolments/${ids.empEnrol}/items/${p.items[1].id}/file`).expect(200);
      expect(pdf.headers['content-type']).toContain('application/pdf');
      await api('r1', 'get', `/learning/my/enrolments/${ids.empEnrol}/items/${p.items[1].id}/file`).expect(404);
      await api('emp', 'post', `/learning/my/enrolments/${ids.empEnrol}/items/${randomUUID()}/done`).expect(404);
      expect((await api('emp', 'post', `/learning/my/enrolments/${ids.empEnrol}/items/${p.items[0].id}/done`).expect(201)).body).toMatchObject({ progress: 0, completed: false });
      expect((await api('emp', 'post', `/learning/my/enrolments/${ids.empEnrol}/items/${p.items[1].id}/done`).expect(201)).body).toMatchObject({ progress: 50, completed: false });
      const done = (await api('emp', 'post', `/learning/my/enrolments/${ids.empEnrol}/items/${p.items[2].id}/done`).expect(201)).body;
      expect(done).toMatchObject({ progress: 100, completed: true, certificate: { title: 'Food safety basics', issuedOn: today } });
      expect(done.certificate.expiresOn.slice(0, 4)).toBe(String(Number(today.slice(0, 4)) + 1));
      expect((await api('emp', 'post', `/learning/my/enrolments/${ids.empEnrol}/items/${p.items[0].id}/done`).expect(409)).body.code).toBe('LEARNING_NOT_ENROLLED');
      const mine = (await api('emp', 'get', '/learning/my').expect(200)).body;
      expect(mine.certificates).toEqual([expect.objectContaining({ title: 'Food safety basics', issuedOn: today })]);
      expect(mine.enrolments.find((e: { id: string }) => e.id === ids.empEnrol).status).toBe('completed');
    });

    it('nominating: a manager their own reports only; L&D anyone; a mandatory course can’t be declined; others with a reason', async () => {
      expect((await api('mgr', 'get', '/learning/my/nominate/people').expect(200)).body.map((p: { id: string }) => p.id).sort()).toEqual([users.r1, users.r2].sort());
      expect((await api('r1', 'get', '/learning/my/nominate/people').expect(200)).body).toEqual([]);
      await api('mgr', 'post', `/learning/my/courses/${ids.mandatory}/nominate`).send({ userIds: [users.emp] }).expect(403);
      await api('mgr', 'post', `/learning/my/courses/${ids.mandatory}/nominate`).send({ userIds: [users.r1], dueOn: shift(-1) }).expect(400);
      await api('mgr', 'post', `/learning/my/courses/${ids.draft}/nominate`).send({ userIds: [users.r1] }).expect(404);
      expect((await api('mgr', 'post', `/learning/my/courses/${ids.mandatory}/nominate`).send({ userIds: [users.r1], dueOn: shift(30) }).expect(201)).body.nominated).toBe(1);
      expect((await api('hr', 'post', `/learning/my/courses/${ids.course}/nominate`).send({ userIds: [users.r2, users.emp] }).expect(201)).body.nominated).toBe(2);
      await api('hr', 'post', `/learning/my/courses/${ids.course}/nominate`).send({ userIds: [users.empB] }).expect(403);
      const r1 = (await api('r1', 'get', '/learning/my').expect(200)).body.enrolments.find((e: { course: { id: string } }) => e.course.id === ids.mandatory);
      expect(r1).toMatchObject({ source: 'nominated', dueOn: shift(30), canDecline: false });
      expect((await api('r1', 'post', `/learning/my/enrolments/${r1.id}/decline`).send({ reason: 'I am on leave that week.' }).expect(409)).body.code).toBe('LEARNING_MANDATORY');
      const r2 = (await api('r2', 'get', '/learning/my').expect(200)).body.enrolments.find((e: { course: { id: string } }) => e.course.id === ids.course);
      expect(r2.canDecline).toBe(true);
      await api('r2', 'post', `/learning/my/enrolments/${r2.id}/decline`).send({ reason: 'short' }).expect(400);
      await api('r2', 'post', `/learning/my/enrolments/${r2.id}/decline`).send({ reason: 'I took this course last year.' }).expect(201);
      expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.hr, type: 'learning.enrolment.update' } }))).toBe(1);
      expect((await api('hr', 'get', `/learning/courses/${ids.course}`).expect(200)).body.enrolments.find((e: { person: string }) => e.person === `r2 ${run}`)).toMatchObject({ status: 'declined', reason: 'I took this course last year.' });
    });

    it('another company sees none of it', async () => {
      expect((await api('adminB', 'get', '/learning/courses').expect(200)).body).toEqual([]);
      await api('adminB', 'get', `/learning/courses/${ids.course}`).expect(404);
      expect((await api('empB', 'get', '/learning/my').expect(200)).body.catalogue).toEqual([]);
      await api('empB', 'post', `/learning/my/courses/${ids.course}/enrol`).expect(404);
      await api('empB', 'get', `/learning/my/enrolments/${ids.empEnrol}`).expect(404);
    });
  });
});
