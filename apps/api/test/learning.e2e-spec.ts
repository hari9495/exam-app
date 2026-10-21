import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { LearningAssignService } from '../src/learning/learning-assign.service';
import { verifyElsewhere } from '../src/documents/verify-code';

// Learning core against the real database (forced RLS): courses (LRN-03), assignment rules (LRN-07), My learning and
// the player with completion and certificate (LRN-01, 02), reminders and escalation, compliance in scope (LRN-08), the
// manager's team and the person's Learning tab (PPL-03). Each with its key, scope and company boundary.
describe('Learning: courses, rules, completion, certificates, reminders, compliance (LRN-01, 02, 03, 07, 08)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const joined = addDays(today, -400);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'ldA' | 'hrTn' | 'mgrU' | 'arjunU' | 'imranU' | 'nobodyA' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@learn.test`;
  const audits = (action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));
  const bells = (who: Who, type: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users[who], type } }));
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

  beforeAll(async () => {
    process.env.SD_SCANNER = process.env.SD_SCANNER ?? 'dev-fake';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `learn-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Learn Org ${k}`, slug: `learn-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const masters = async (k: 'A' | 'B', tag: string, isDefault: boolean) =>
      tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${tag}`] = (await tx.legalEntity.create({ data: { ...o, name: `Entity ${tag}`, shortName: tag, isDefault, employeeCodePrefix: tag } })).id;
        ids[`loc${tag}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`le${tag}`], name: `Site ${tag}`, code: tag, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const id = randomUUID();
        await tx.department.create({ data: { ...o, id, name: `Quality ${tag}`, code: `Q${tag}`, path: `/${id}/` } });
        ids[`dept${tag}`] = id;
        ids[`des${tag}`] = (await tx.designation.create({ data: { ...o, name: `Line Operator ${tag}`, code: `LO${tag}` } })).id;
        ids[`type${tag}`] = (await tx.employmentType.create({ data: { ...o, name: `Permanent ${tag}`, code: `P${tag}`, category: 'permanent' } })).id;
      });
    await masters('A', 'KF', true);
    await masters('A', 'TN', false);
    await masters('B', 'BB', true);

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hr = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override'], 'HR');
    const ld = await profile(['learning.manage', 'learning.report.view'], 'L&D');
    ids.reports = await profile(['learning.report.view'], 'Training reports');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hrA', 'A', 'panel', hr],
      ['ldA', 'A', 'panel', ld],
      ['hrTn', 'A', 'panel', null],
      ['mgrU', 'A', 'panel', null],
      ['arjunU', 'A', 'panel', null],
      ['imranU', 'A', 'panel', null],
      ['nobodyA', 'A', 'panel', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    // Training reports for the TN entity only.
    await tenantPrisma.forTenant(ctx('A'), (tx) =>
      tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrTn, permissionProfileId: ids.reports, scopeType: 'legal_entity', legalEntityId: ids.leTN, validFrom: new Date(`${addDays(today, -30)}T00:00:00Z`), status: 'active', reason: 'Plant HR' } }),
    );
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (tag: string, givenName: string, code: string, user: Who, manager: string | null) => {
      const id = (
        await api('hrA', 'post', '/people/employees')
          .send({ legalEntityId: ids[`le${tag}`], employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids[`loc${tag}`], departmentId: ids[`dept${tag}`], designationId: ids[`des${tag}`], employmentTypeId: ids[`type${tag}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
      await tenantPrisma.forTenant(SUPER, (tx) => tx.employee.update({ where: { id }, data: { userId: users[user] } }));
      return id;
    };
    ids.divya = await hire('KF', 'Divya', 'KF0001', 'mgrU', null);
    ids.arjun = await hire('KF', 'Arjun', 'KF0142', 'arjunU', ids.divya);
    ids.imran = await hire('TN', 'Imran', 'TN0001', 'imranU', ids.divya);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  const course = { title: 'Fire safety and evacuation', source: 'company', durationMinutes: 45, cost: 0, mandatory: true, needsApproval: false, certificate: true, certificateMonths: 12, skills: ['Fire safety'] };

  it('L&D builds a course: items in order, at least one required to publish; nobody else may', async () => {
    await api('arjunU', 'get', '/learning/admin/courses').expect(403);
    await api('hrTn', 'post', '/learning/admin/courses').send(course).expect(403);
    ids.course = (await api('ldA', 'post', '/learning/admin/courses').send(course).expect(201)).body.id;
    await api('ldA', 'post', '/learning/admin/courses').send(course).expect(409);
    // Publishing needs a required item.
    await api('ldA', 'post', `/learning/admin/courses/${ids.course}/status`).send({ status: 'published', version: 1 }).expect(400);
    await api('ldA', 'post', `/learning/admin/courses/${ids.course}/items`).send({ title: 'Evacuation map', kind: 'link', minutes: 5, required: true, url: 'http://example.test/map' }).expect(400);
    ids.link = (await api('ldA', 'post', `/learning/admin/courses/${ids.course}/items`).send({ title: 'Evacuation map', kind: 'link', minutes: 5, required: true, url: 'https://example.test/map' }).expect(201)).body.id;
    ids.pdf = (await api('ldA', 'post', `/learning/admin/courses/${ids.course}/items`).field('title', 'Fire safety handbook').field('kind', 'pdf').field('minutes', '20').field('required', 'false').attach('file', PDF, 'handbook.pdf').expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${ids.course}/items`).field('title', 'Not a PDF').field('kind', 'pdf').field('minutes', '1').field('required', 'false').attach('file', Buffer.from('<html></html>'), 'x.pdf').expect(400);
    await api('ldA', 'patch', `/learning/admin/courses/${ids.course}/items/${ids.pdf}`).send({ move: 'up' }).expect(200);
    expect((await api('ldA', 'get', `/learning/admin/courses/${ids.course}`).expect(200)).body.items.map((i: { title: string }) => i.title)).toEqual(['Fire safety handbook', 'Evacuation map']);
    await api('ldA', 'post', `/learning/admin/courses/${ids.course}/status`).send({ status: 'published', version: 1 }).expect(200);
    // Another company: nothing of A.
    expect((await api('adminB', 'get', '/learning/admin/courses').expect(200)).body).toEqual([]);
    await api('adminB', 'get', `/learning/admin/courses/${ids.course}`).expect(404);
    expect(await audits('learning.course.published')).toHaveLength(1);
  });

  it('an assignment rule enrols who it covers, with the due date; preview first; never twice', async () => {
    const rule = { name: 'Fire safety for KF plant', courseId: ids.course, legalEntityIds: [ids.leKF], locationIds: [ids.locKF], departmentIds: [], designation: 'operator', dueDays: 30, repeatMonths: 12, active: true };
    await api('hrTn', 'post', '/learning/rules/preview').send(rule).expect(403);
    await api('ldA', 'post', '/learning/rules/preview').send({ ...rule, legalEntityIds: [randomUUID()] }).expect(400);
    const preview = (await api('ldA', 'post', '/learning/rules/preview').send(rule).expect(200)).body;
    expect(preview).toMatchObject({ matches: 2, toEnrol: 2 });
    expect(preview.people.sort()).toEqual(['Arjun', 'Divya']);
    const made = (await api('ldA', 'post', '/learning/rules').send(rule).expect(201)).body;
    expect(made.enrolled).toBe(2);
    ids.rule = made.id;
    // The daily check makes no second enrolment.
    expect((await app.get(LearningAssignService).sweep()).enrolled).toBe(0);
    const list = (await api('ldA', 'get', '/learning/rules').expect(200)).body;
    expect(list[0]).toMatchObject({ name: 'Fire safety for KF plant', course: 'Fire safety and evacuation', population: 'Entity KF · Site KF · designation has "operator"', matches: 2, active: true });
    // A course with an active rule can't be retired.
    await api('ldA', 'post', `/learning/admin/courses/${ids.course}/status`).send({ status: 'retired', version: 2 }).expect(409);
  });

  it('the learner: My learning with the due date; the player; the required item completes it and issues the certificate', async () => {
    const me = (await api('arjunU', 'get', '/learning/me').expect(200)).body;
    expect(me.catalogue.map((c: { title: string }) => c.title)).toEqual(['Fire safety and evacuation']);
    expect(me.enrolments).toHaveLength(1);
    expect(me.enrolments[0]).toMatchObject({ status: 'Enrolled', source: 'Assigned by rule', due: addDays(today, 30), progress: 0 });
    ids.arjunEnrol = me.enrolments[0].id;
    // Nobody else opens Arjun's enrolment.
    await api('imranU', 'get', `/learning/enrolments/${ids.arjunEnrol}`).expect(404);
    await api('adminB', 'get', `/learning/enrolments/${ids.arjunEnrol}`).expect(404);
    const player = (await api('arjunU', 'get', `/learning/enrolments/${ids.arjunEnrol}`).expect(200)).body;
    expect(player.items.map((i: { kind: string; required: boolean }) => [i.kind, i.required])).toEqual([['PDF', false], ['Link', true]]);
    // The PDF opens for the enrolled learner (inline), not for someone who isn't.
    await api('arjunU', 'get', `/learning/items/${ids.pdf}/file`).expect(200);
    await api('imranU', 'get', `/learning/items/${ids.pdf}/file`).expect(404);
    // The optional item starts it; the required one completes it.
    expect((await api('arjunU', 'post', `/learning/enrolments/${ids.arjunEnrol}/items/${ids.pdf}/done`).expect(200)).body).toEqual({ completed: false, certificateId: null });
    expect((await api('arjunU', 'get', '/learning/me').expect(200)).body.enrolments[0].status).toBe('In progress');
    const done = (await api('arjunU', 'post', `/learning/enrolments/${ids.arjunEnrol}/items/${ids.link}/done`).expect(200)).body;
    expect(done.completed).toBe(true);
    ids.cert = done.certificateId;
    const after = (await api('arjunU', 'get', '/learning/me').expect(200)).body;
    expect(after.certificates).toEqual([{ id: ids.cert, title: 'Fire safety and evacuation', issued: today, expires: expect.any(String), renewal: null }]);
    // The certificate: the holder and the manager download it; another employee does not; its code verifies publicly.
    const pdf = await api('arjunU', 'get', `/learning/certificates/${ids.cert}/pdf`).expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    await api('mgrU', 'get', `/learning/certificates/${ids.cert}/pdf`).expect(200);
    await api('imranU', 'get', `/learning/certificates/${ids.cert}/pdf`).expect(404);
    const code = (await tenantPrisma.forTenant(SUPER, (tx) => tx.learningCertificate.findUniqueOrThrow({ where: { id: ids.cert } }))).verifyCode;
    expect(await verifyElsewhere(code)).toMatchObject({ company: 'Learn Org A', name: 'Arjun', issuedOn: today, status: 'current' });
    expect(await audits('learning.certificate.issued')).toHaveLength(1);
  });

  it('self-enrolment once; a course needing approval is asked for; nobody without an employee record enrols', async () => {
    const r = (await api('imranU', 'post', `/learning/courses/${ids.course}/enrol`).expect(201)).body;
    expect(r.status).toBe('Enrolled');
    ids.imranEnrol = r.id;
    await api('imranU', 'post', `/learning/courses/${ids.course}/enrol`).expect(409);
    await api('nobodyA', 'post', `/learning/courses/${ids.course}/enrol`).expect(403);
    const paid = (await api('ldA', 'post', '/learning/admin/courses').send({ ...course, title: 'Lean six sigma', mandatory: false, needsApproval: true, certificate: false, source: 'provider', provider: 'Kaizen Institute', cost: 24000 }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${paid}/items`).send({ title: 'Course page', kind: 'link', minutes: 600, required: true, url: 'https://example.test/lean' }).expect(201);
    await api('ldA', 'post', `/learning/admin/courses/${paid}/status`).send({ status: 'published', version: 1 }).expect(200);
    expect((await api('arjunU', 'post', `/learning/courses/${paid}/enrol`).expect(201)).body.status).toBe('Requested');
    await api('adminB', 'post', `/learning/courses/${paid}/enrol`).expect(403);
  });

  it('a course needing approval: the manager, then L&D, decide in Approvals; a refusal can be asked again; the bond is accepted', async () => {
    const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string; step: { name: string } }[];
    const decide = (who: Who, taskId: string, decision: 'approve' | 'reject') => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, reason: decision === 'reject' ? 'Not this quarter' : undefined });
    const status = async () => ((await api('arjunU', 'get', '/learning/me').expect(200)).body.enrolments as { course: { title: string }; status: string }[]).find((e) => e.course.title === 'Lean six sigma')?.status;
    // Arjun asked for Lean six sigma (the self-enrolment test): his manager first, then L&D.
    expect(await status()).toBe('Requested');
    expect((await inbox('ldA')).filter((t) => t.title === 'Arjun: Lean six sigma')).toEqual([]);
    const mgrTask = (await inbox('mgrU')).find((t) => t.title === 'Arjun: Lean six sigma')!;
    expect(mgrTask.step.name).toBe('Manager');
    await decide('mgrU', mgrTask.taskId, 'approve').expect(200);
    expect(await status()).toBe('Requested');
    const ldTask = (await inbox('ldA')).find((t) => t.title === 'Arjun: Lean six sigma')!;
    expect(ldTask.step.name).toBe('L&D');
    // Nobody else decides it; the person never does.
    await decide('arjunU', ldTask.taskId, 'approve').expect((r) => expect([403, 404]).toContain(r.status));
    await decide('ldA', ldTask.taskId, 'approve').expect(200);
    expect(await status()).toBe('Enrolled');
    // A bond course: the bond must be accepted; a refusal leaves it declined, and the person may ask again.
    const cert = (await api('ldA', 'post', '/learning/admin/courses').send({ ...course, title: 'Certified quality auditor', mandatory: false, needsApproval: true, certificate: false, cost: 32000 }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${cert}/items`).send({ title: 'Course page', kind: 'link', minutes: 60, required: true, url: 'https://example.test/cqa' }).expect(201);
    await api('ldA', 'post', `/learning/admin/courses/${cert}/status`).send({ status: 'published', version: 1 }).expect(200);
    await api('imranU', 'post', `/learning/courses/${cert}/enrol`).send({}).expect(400);
    await api('imranU', 'post', `/learning/courses/${cert}/enrol`).send({ acceptBond: true }).expect(201);
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.learningEnrolment.findFirstOrThrow({ where: { courseId: cert } }))).bondAcceptedAt).not.toBeNull();
    const t2 = (await inbox('mgrU')).find((t) => t.title === 'Imran: Certified quality auditor')!;
    await decide('mgrU', t2.taskId, 'reject').expect(200);
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.learningEnrolment.findFirstOrThrow({ where: { courseId: cert } }))).status).toBe('declined');
    expect(((await api('imranU', 'get', '/learning/me').expect(200)).body.enrolments as { course: { title: string } }[]).some((e) => e.course.title === 'Certified quality auditor')).toBe(false);
    await api('imranU', 'post', `/learning/courses/${cert}/enrol`).send({ acceptBond: true }).expect(201);
    expect(await audits('learning.enrolment.approved')).toHaveLength(1);
    expect(await audits('learning.enrolment.declined')).toHaveLength(1);
  });

  it('external training: asked with its provider, fees and reason; the bond above the threshold; the manager, then L&D', async () => {
    const ask = { title: 'Certified Quality Auditor preparation', provider: 'Deccan Quality Institute', cost: 32000, reason: 'Supplier audits are 40% of my goals this year.' };
    await api('arjunU', 'post', '/learning/me/external').send({ ...ask, reason: 'short' }).expect(400);
    await api('arjunU', 'post', '/learning/me/external').send(ask).expect(400);
    await api('nobodyA', 'post', '/learning/me/external').send({ ...ask, acceptBond: true }).expect(403);
    const { id } = (await api('arjunU', 'post', '/learning/me/external').send({ ...ask, acceptBond: true }).expect(201)).body;
    const mine = () => api('arjunU', 'get', '/learning/me').expect(200).then((r) => r.body.external as { id: string; status: string }[]);
    expect(await mine()).toEqual([expect.objectContaining({ id, title: ask.title, provider: ask.provider, cost: 32000, status: 'Requested' })]);
    const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string; summary: { label: string; value: string }[] }[];
    const t1 = (await inbox('mgrU')).find((t) => t.title === `Arjun: ${ask.title} (external)`)!;
    expect(t1.summary.map((x) => x.label)).toEqual(['Training', 'Fees', 'Why', 'Training bond']);
    await api('mgrU', 'post', `/workflow/approvals/tasks/${t1.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    const t2 = (await inbox('ldA')).find((t) => t.title === `Arjun: ${ask.title} (external)`)!;
    await api('ldA', 'post', `/workflow/approvals/tasks/${t2.taskId}/decide`).send({ decision: 'approve' }).expect(200);
    expect((await mine())[0].status).toBe('Approved');
    // Another company's people see none of it.
    expect((await api('adminB', 'get', '/learning/me').expect(200)).body.external).toEqual([]);
    expect(await audits('learning.external.approved')).toHaveLength(1);
  });

  it('reminders 7 and 2 days ahead, the manager the day after, training reports after 7 days; each once', async () => {
    const remind = app.get(LearningAssignService);
    const setDue = (id: string, day: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.learningEnrolment.update({ where: { id }, data: { dueOn: new Date(`${day}T00:00:00Z`) } }));
    await setDue(ids.imranEnrol, addDays(today, 2));
    expect(await remind.remind(today, { organizationId: org.A.id, enrolmentIds: [ids.imranEnrol] })).toBe(1);
    expect(await remind.remind(today, { organizationId: org.A.id, enrolmentIds: [ids.imranEnrol] })).toBe(0);
    expect(await bells('imranU', 'learning.before_2')).toBe(1);
    await setDue(ids.imranEnrol, addDays(today, -1));
    expect(await remind.remind(today, { organizationId: org.A.id, enrolmentIds: [ids.imranEnrol] })).toBe(1);
    expect(await bells('mgrU', 'learning.overdue_manager')).toBe(1);
    await setDue(ids.imranEnrol, addDays(today, -8));
    expect(await remind.remind(today, { organizationId: org.A.id, enrolmentIds: [ids.imranEnrol] })).toBe(1);
    // Training reports over Imran: the company-wide L&D and the TN reporter.
    expect(await bells('ldA', 'learning.overdue_hr')).toBe(1);
    expect(await bells('hrTn', 'learning.overdue_hr')).toBe(1);
    expect(await bells('arjunU', 'learning.overdue_hr')).toBe(0);
  });

  it('compliance: by department for people in scope; overdue and the export; Remind overdue; nothing for others', async () => {
    await api('arjunU', 'get', '/learning/compliance').expect(403);
    const all = (await api('ldA', 'get', '/learning/compliance').expect(200)).body;
    expect(all.courses).toEqual(['Fire safety and evacuation']);
    expect(all.rows).toEqual([
      { dept: 'Quality KF', done: [1], assigned: [2], size: 2 },
      { dept: 'Quality TN', done: [0], assigned: [1], size: 1 },
    ]);
    expect(all.overdue).toMatchObject([{ name: 'Imran', dept: 'Quality TN', course: 'Fire safety and evacuation', manager: 'Divya' }]);
    // The TN reporter sees TN only; the entity switcher narrows L&D too.
    expect((await api('hrTn', 'get', '/learning/compliance').expect(200)).body.rows.map((r: { dept: string }) => r.dept)).toEqual(['Quality TN']);
    expect((await api('ldA', 'get', `/learning/compliance?entityId=${ids.leKF}`).expect(200)).body.rows.map((r: { dept: string }) => r.dept)).toEqual(['Quality KF']);
    const csv = (await api('ldA', 'get', '/learning/compliance/export').expect(200)).text;
    expect(csv).toContain('Arjun,Quality KF,Line Operator KF,Fire safety and evacuation,Compliant');
    expect(csv).toContain('Imran,Quality TN,Line Operator TN,Fire safety and evacuation,Overdue');
    expect((await api('hrTn', 'post', '/learning/compliance/remind').expect(200)).body).toEqual({ reminded: 1 });
    expect(await bells('imranU', 'learning.overdue')).toBe(1);
    expect((await api('adminB', 'get', '/learning/compliance').expect(200)).body.rows).toEqual([]);
    expect(await audits('learning.report.exported')).toHaveLength(1);
  });

  it('the manager sees their team; the Learning tab is for the person, their manager or training reports in scope', async () => {
    const team = (await api('mgrU', 'get', '/learning/team').expect(200)).body;
    expect(team.people.map((p: { name: string; cells: string[] }) => [p.name, p.cells])).toEqual([
      ['Arjun', ['Completed']],
      ['Imran', ['Overdue']],
    ]);
    expect((await api('arjunU', 'get', '/learning/team').expect(200)).body.people).toEqual([]);
    const tab = (await api('mgrU', 'get', `/learning/people/${ids.arjun}`).expect(200)).body;
    expect(tab.map((r: { course: string; status: string }) => [r.course, r.status])).toEqual(expect.arrayContaining([['Fire safety and evacuation', 'Completed'], ['Lean six sigma', 'Enrolled']]));
    await api('arjunU', 'get', `/learning/people/${ids.arjun}`).expect(200);
    await api('ldA', 'get', `/learning/people/${ids.arjun}`).expect(200);
    await api('imranU', 'get', `/learning/people/${ids.arjun}`).expect(404);
    await api('hrTn', 'get', `/learning/people/${ids.arjun}`).expect(404);
    await api('hrTn', 'get', `/learning/people/${ids.imran}`).expect(200);
    await api('adminB', 'get', `/learning/people/${ids.arjun}`).expect(404);
  });
});
