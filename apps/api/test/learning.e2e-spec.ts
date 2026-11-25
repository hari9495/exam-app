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
import { LearningFeedbackService } from '../src/learning/learning-feedback.service';
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

  it('sessions: trainers, a seat or the waitlist, withdraw moves the next up, decline with a reason, QR check-in, confirm gives results', async () => {
    await api('arjunU', 'get', '/learning/trainers').expect(403);
    await api('ldA', 'post', '/learning/trainers').send({ external: false, employeeId: randomUUID() }).expect(400);
    const internal = (await api('ldA', 'post', '/learning/trainers').send({ external: false, employeeId: ids.divya }).expect(201)).body.id;
    await api('ldA', 'post', '/learning/trainers').send({ external: false, employeeId: ids.divya }).expect(409);
    await api('ldA', 'post', '/learning/trainers').send({ external: true, name: 'Ramesh Kamath', orgName: 'Safe Works Training' }).expect(201);
    expect((await api('ldA', 'get', '/learning/trainers').expect(200)).body.map((t: { name: string; external: boolean }) => [t.name, t.external])).toEqual([['Divya', false], ['Ramesh Kamath', true]]);
    // A classroom course: no content item needed; half the slots complete it.
    const forklift = (await api('ldA', 'post', '/learning/admin/courses').send({ ...course, title: 'Forklift refresher', type: 'classroom', attendancePct: 50, mandatory: false }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${forklift}/status`).send({ status: 'published', version: 1 }).expect(200);
    const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    const slots = [{ startsAt: at(24), endsAt: at(26) }, { startsAt: at(48), endsAt: at(50) }];
    await api('ldA', 'post', '/learning/sessions').send({ courseId: ids.course, mode: 'classroom', venue: 'Room 2', trainerId: internal, seats: 1, slots, costLines: [] }).expect(400);
    await api('ldA', 'post', '/learning/sessions').send({ courseId: forklift, mode: 'classroom', venue: 'Room 2', trainerId: internal, seats: 1, slots: [slots[1], slots[0]], costLines: [] }).expect(400);
    const sid = (await api('ldA', 'post', '/learning/sessions').send({ courseId: forklift, mode: 'classroom', venue: 'Hosur plant, training room 2', trainerId: internal, seats: 1, slots, costLines: [{ label: 'Trainer fee', amount: 12000 }, { label: 'Materials', amount: 1800 }] }).expect(201)).body.id;
    await api('adminB', 'get', `/learning/sessions/${sid}`).expect(404);
    await api('arjunU', 'get', `/learning/sessions/${sid}`).expect(404);
    // Nominations: L&D anyone; one seat, so the second waits. Someone with no learning key and no team may not.
    await api('hrTn', 'post', `/learning/sessions/${sid}/nominate`).send({ employeeIds: [ids.arjun] }).expect(403);
    expect((await api('ldA', 'post', `/learning/sessions/${sid}/nominate`).send({ employeeIds: [ids.arjun, ids.imran] }).expect(200)).body.result).toEqual([
      { name: 'Arjun', result: 'Enrolled' },
      { name: 'Imran', result: 'Waitlist, position 1' },
    ]);
    expect(await bells('imranU', 'learning.nominated')).toBe(1);
    let page = (await api('ldA', 'get', `/learning/sessions/${sid}`).expect(200)).body;
    expect([page.enrolled.map((e: { name: string }) => e.name), page.waitlist.map((e: { name: string }) => e.name)]).toEqual([['Arjun'], ['Imran']]);
    // Withdrawing Arjun moves Imran up and tells him.
    const arjunSeat = page.enrolled[0].enrolmentId;
    expect((await api('ldA', 'post', `/learning/sessions/${sid}/withdraw`).send({ enrolmentId: arjunSeat }).expect(200)).body).toEqual({ promoted: 'Imran' });
    expect(await bells('imranU', 'learning.waitlist_promoted')).toBe(1);
    // His manager (Divya, also the trainer) nominates Arjun again: the waitlist. He declines with a reason; she is told.
    expect((await api('mgrU', 'post', `/learning/sessions/${sid}/nominate`).send({ employeeIds: [ids.arjun] }).expect(200)).body.result).toEqual([{ name: 'Arjun', result: 'Waitlist, position 1' }]);
    const arjunEnrol = ((await api('arjunU', 'get', '/learning/me').expect(200)).body.enrolments as { id: string; course: { title: string }; status: string }[]).find((e) => e.course.title === 'Forklift refresher')!;
    expect(arjunEnrol.status).toBe('Waitlisted');
    await api('arjunU', 'post', `/learning/enrolments/${arjunEnrol.id}/decline`).send({ reason: 'short' }).expect(400);
    await api('arjunU', 'post', `/learning/enrolments/${arjunEnrol.id}/decline`).send({ reason: 'I am on leave the whole week of the session.' }).expect(200);
    expect(await bells('mgrU', 'learning.nomination_declined')).toBe(1);
    // A mandatory course's nomination can't be declined.
    const fire = (await api('ldA', 'post', '/learning/admin/courses').send({ ...course, title: 'Fire drill', type: 'classroom' }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${fire}/status`).send({ status: 'published', version: 1 }).expect(200);
    const fs = (await api('ldA', 'post', '/learning/sessions').send({ courseId: fire, mode: 'classroom', venue: 'Yard', trainerId: internal, seats: 5, slots: [slots[0]], costLines: [] }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/sessions/${fs}/nominate`).send({ employeeIds: [ids.arjun] }).expect(200);
    const drill = ((await api('arjunU', 'get', '/learning/me').expect(200)).body.enrolments as { id: string; course: { title: string } }[]).find((e) => e.course.title === 'Fire drill')!;
    await api('arjunU', 'post', `/learning/enrolments/${drill.id}/decline`).send({ reason: 'I am on leave the whole week of the session.' }).expect(409);
    await api('ldA', 'post', `/learning/admin/courses/${fire}/status`).send({ status: 'retired', version: 2 }).expect(200);
    // Attendance: the trainer shows the code; Imran checks in with it; a stale code and people without a seat are refused.
    page = (await api('ldA', 'get', `/learning/sessions/${sid}`).expect(200)).body;
    const [slot1, slot2] = page.session.slots.map((x: { id: string }) => x.id);
    const shown = (await api('mgrU', 'get', `/learning/sessions/${sid}/slots/${slot1}/code`).expect(200)).body;
    expect(shown).toMatchObject({ closed: false, code: expect.stringMatching(/^\d{6}$/), expected: [{ name: 'Imran' }], present: [] });
    await api('imranU', 'post', '/learning/check-in').send({ sessionId: sid, slotId: slot1, code: shown.code === '000000' ? '111111' : '000000', via: 'qr' }).expect(400);
    await api('arjunU', 'post', '/learning/check-in').send({ sessionId: sid, slotId: slot1, code: shown.code, via: 'qr' }).expect(404);
    expect((await api('imranU', 'post', '/learning/check-in').send({ sessionId: sid, slotId: slot1, code: shown.code, via: 'qr' }).expect(200)).body.status).toMatch(/Present|Late/);
    await api('mgrU', 'post', `/learning/sessions/${sid}/slots/${slot1}/close`).expect(200);
    await api('imranU', 'post', '/learning/check-in').send({ sessionId: sid, slotId: slot1, code: shown.code, via: 'qr' }).expect(409);
    await api('mgrU', 'post', `/learning/sessions/${sid}/slots/${slot2}/attendance`).send({ marks: [{ enrolmentId: page.enrolled[0].enrolmentId, status: 'absent' }] }).expect(200);
    await api('arjunU', 'post', `/learning/sessions/${sid}/slots/${slot2}/attendance`).send({ marks: [] }).expect(404);
    // Confirm only after the last slot; then 1 of 2 slots at 50% completes it, with the certificate.
    await api('ldA', 'post', `/learning/sessions/${sid}/confirm`).send({ version: page.session.version }).expect(409);
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      await tx.$executeRaw`UPDATE learning_session_slots SET starts_at = starts_at - interval '60 hours', ends_at = ends_at - interval '60 hours' WHERE session_id = ${sid}::uuid`;
    });
    expect((await api('ldA', 'post', `/learning/sessions/${sid}/confirm`).send({ version: page.session.version }).expect(200)).body).toEqual({ completed: 1, no_show: 0, failed: 0 });
    await api('ldA', 'post', `/learning/sessions/${sid}/confirm`).send({ version: page.session.version + 1 }).expect(409);
    page = (await api('ldA', 'get', `/learning/sessions/${sid}`).expect(200)).body;
    expect(page.results).toEqual([{ name: 'Imran', status: 'Completed', reason: 'Attended 1 of 2 slots' }]);
    expect(page.attendance[0]).toMatchObject({ name: 'Imran', method: expect.stringContaining('QR') });
    expect(((await api('imranU', 'get', '/learning/me').expect(200)).body.certificates as { title: string }[]).map((x) => x.title)).toContain('Forklift refresher');
    expect(await audits('learning.attendance.confirmed')).toHaveLength(1);
    ids.forkliftSession = sid;
  });

  it('LRN-12 and 2608: attendees rate a confirmed session once; the trainer sees no results; the manager is asked later, once', async () => {
    const sid = ids.forkliftSession;
    // 2608: Divya trains the session but is not L&D: attendance, never results.
    const trainerView = (await api('mgrU', 'get', `/learning/sessions/${sid}`).expect(200)).body;
    expect(trainerView.results).toEqual([]);
    expect(trainerView.attendance[0]).toMatchObject({ name: 'Imran' });
    expect(await bells('imranU', 'learning.rate_session')).toBe(1);
    expect((await api('imranU', 'get', '/learning/feedback/due').expect(200)).body).toEqual([expect.objectContaining({ sessionId: sid, course: 'Forklift refresher', trainer: 'Divya' })]);
    expect((await api('arjunU', 'get', '/learning/feedback/due').expect(200)).body).toEqual([]);
    await api('imranU', 'post', `/learning/sessions/${sid}/reaction`).send({ overall: 6, trainer: 4 }).expect(400);
    await api('arjunU', 'post', `/learning/sessions/${sid}/reaction`).send({ overall: 4, trainer: 4 }).expect(404);
    await api('adminB', 'post', `/learning/sessions/${sid}/reaction`).send({ overall: 4, trainer: 4 }).expect(404);
    await api('imranU', 'post', `/learning/sessions/${sid}/reaction`).send({ overall: 4, trainer: 5, comment: 'Good drills' }).expect(200);
    expect((await api('imranU', 'post', `/learning/sessions/${sid}/reaction`).send({ overall: 4, trainer: 5 }).expect(409)).body.code).toBe('LEARNING_RATED');
    expect((await api('imranU', 'get', '/learning/feedback/due').expect(200)).body).toEqual([]);
    expect((await api('ldA', 'get', `/learning/sessions/${sid}`).expect(200)).body.feedback).toEqual({ responses: 1, overall: 4, trainer: 5, comments: ['Good drills'] });
    // The manager's check: only after the company's days (60), only about their own reports, once; asked once.
    const feedback = app.get(LearningFeedbackService);
    expect((await api('mgrU', 'get', '/learning/checks').expect(200)).body).toEqual([]);
    await feedback.askChecks();
    expect(await bells('mgrU', 'learning.training_check')).toBe(0);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.learningSession.update({ where: { id: sid }, data: { attendanceConfirmedAt: new Date(Date.now() - 61 * 86_400_000) } }));
    const due = (await api('mgrU', 'get', '/learning/checks').expect(200)).body;
    expect(due).toEqual([expect.objectContaining({ person: 'Imran', course: 'Forklift refresher', trainer: 'Divya' })]);
    expect((await api('arjunU', 'get', '/learning/checks').expect(200)).body).toEqual([]);
    await api('arjunU', 'post', `/learning/checks/${due[0].enrolmentId}`).send({ applying: 'yes' }).expect(404);
    await api('mgrU', 'post', `/learning/checks/${due[0].enrolmentId}`).send({ applying: 'maybe' }).expect(400);
    await feedback.askChecks();
    expect(await bells('mgrU', 'learning.training_check')).toBe(1);
    await feedback.askChecks();
    expect(await bells('mgrU', 'learning.training_check')).toBe(1);
    await api('mgrU', 'post', `/learning/checks/${due[0].enrolmentId}`).send({ applying: 'partly', comment: 'Uses the checklist' }).expect(200);
    await api('mgrU', 'post', `/learning/checks/${due[0].enrolmentId}`).send({ applying: 'yes' }).expect(404);
    expect(await audits('learning.session.checked')).toHaveLength(1);
  });

  it('a classroom course completes only by attending: its items alone never complete it; new courses take the company share', async () => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'learning.attendance_share', value: '90' } }));
    const id = (await api('ldA', 'post', '/learning/admin/courses').send({ ...course, title: 'Crane signals', type: 'classroom', mandatory: false }).expect(201)).body.id;
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.learningCourse.findUniqueOrThrow({ where: { id } }))).attendancePct).toBe(90);
    const item = (await api('ldA', 'post', `/learning/admin/courses/${id}/items`).send({ title: 'Hand signals chart', kind: 'link', url: 'https://example.com/signals', minutes: 5, required: true }).expect(201)).body.id;
    const e = await tenantPrisma.forTenant(SUPER, (tx) => tx.learningEnrolment.create({ data: { organizationId: org.A.id, employeeId: ids.arjun, courseId: id, source: 'self', assignedOn: new Date(`${today}T00:00:00Z`), status: 'enrolled' } }));
    expect((await api('arjunU', 'post', `/learning/enrolments/${e.id}/items/${item}/done`).expect(200)).body).toEqual({ completed: false, certificateId: null });
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.learningEnrolment.findUniqueOrThrow({ where: { id: e.id } }))).status).toBe('in_progress');
  });

  it('reminders 7 and 2 days ahead; the learner the day after; answer 2609: the manager after 7 days, HR after 14 (company settings); each once', async () => {
    const remind = app.get(LearningAssignService);
    const setDue = (id: string, day: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.learningEnrolment.update({ where: { id }, data: { dueOn: new Date(`${day}T00:00:00Z`) } }));
    const run = () => remind.remind(today, { organizationId: org.A.id, enrolmentIds: [ids.imranEnrol] });
    await setDue(ids.imranEnrol, addDays(today, 2));
    expect(await run()).toBe(1);
    expect(await run()).toBe(0);
    expect(await bells('imranU', 'learning.before_2')).toBe(1);
    // The day after: only the learner.
    await setDue(ids.imranEnrol, addDays(today, -1));
    expect(await run()).toBe(1);
    expect(await bells('imranU', 'learning.overdue')).toBe(1);
    expect(await bells('mgrU', 'learning.overdue_manager')).toBe(0);
    // 6 days late: nobody new; 7 days: the manager.
    await setDue(ids.imranEnrol, addDays(today, -6));
    expect(await run()).toBe(0);
    await setDue(ids.imranEnrol, addDays(today, -7));
    expect(await run()).toBe(1);
    expect(await bells('mgrU', 'learning.overdue_manager')).toBe(1);
    // HR after 14 by default; a company that set 21 days waits.
    const hrDays = await tenantPrisma.forTenant(SUPER, (tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'learning.overdue.hr_days', value: '21' } }));
    await setDue(ids.imranEnrol, addDays(today, -14));
    expect(await run()).toBe(0);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.setting.delete({ where: { id: hrDays.id } }));
    expect(await run()).toBe(1);
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
    expect(await bells('imranU', 'learning.overdue')).toBe(2); // the sweep's own note, then Remind overdue
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
    // Answer 2608: results for the person, their manager chain and L&D; training reports (HR in scope) see status only.
    const forklift = (rows: { course: string }[]) => rows.find((r) => r.course === 'Forklift refresher') as Record<string, unknown> | undefined;
    for (const who of ['imranU', 'mgrU', 'ldA'] as const) expect(forklift((await api(who, 'get', `/learning/people/${ids.imran}`).expect(200)).body)).toMatchObject({ status: 'Completed', result: 'Attended 1 of 2 slots' });
    const hr = forklift((await api('hrTn', 'get', `/learning/people/${ids.imran}`).expect(200)).body);
    expect(hr).toMatchObject({ status: 'Completed' });
    expect(hr).not.toHaveProperty('result');
  });
  it('G3d skills: a completed course suggests its library skills; the person or their manager decides once; the manager assesses; the team matrix', async () => {
    const skill = await tenantPrisma.forTenant(SUPER, async (tx) => {
      const domain = await tx.companySkill.create({ data: { organizationId: org.A.id, name: 'Safety', kind: 'domain' } });
      const s = await tx.companySkill.create({ data: { organizationId: org.A.id, name: 'Forklift handling', kind: 'skill', parentId: domain.id } });
      const k = await tx.competency.create({ data: { organizationId: org.A.id, companySkillId: s.id, group: 'functional' } });
      await tx.roleCompetencyMap.create({ data: { organizationId: org.A.id, designationId: ids.desKF, competencyId: k.id, expectedLevel: 3, validFrom: new Date('2020-01-01T00:00:00Z') } });
      return s.id;
    });
    const id = (await api('ldA', 'post', '/learning/admin/courses').send({ ...course, title: 'Forklift basics', mandatory: false, certificate: false, cost: 5000, skills: ['forklift handling', 'Not in the library'] }).expect(201)).body.id;
    const item = (await api('ldA', 'post', `/learning/admin/courses/${id}/items`).send({ title: 'Walk-round video link', kind: 'link', minutes: 10, required: true, url: 'https://example.test/walk' }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${id}/status`).send({ status: 'published', version: 1 }).expect(200);
    const enrol = (await api('arjunU', 'post', `/learning/courses/${id}/enrol`).send({}).expect(201)).body;
    const enrolmentId = enrol.id ?? enrol.enrolmentId;
    expect((await api('arjunU', 'post', `/learning/enrolments/${enrolmentId}/items/${item}/done`).expect(200)).body.completed).toBe(true);
    const mine = (await api('arjunU', 'get', '/learning/skills/me').expect(200)).body;
    expect(mine.skills).toEqual([expect.objectContaining({ id: skill, name: 'Forklift handling', level: null, required: 3, source: 'Not assessed' })]);
    expect(mine.suggestions).toEqual([expect.objectContaining({ skill: 'Forklift handling', level: 2, evidence: 'Forklift basics' })]);
    expect(mine.canAssess).toBe(false);
    // Others: 404; the manager (Divya) sees and may assess; L&D sees but neither decides nor assesses.
    await api('imranU', 'get', `/learning/skills/people/${ids.arjun}`).expect(404);
    await api('adminB', 'get', `/learning/skills/people/${ids.arjun}`).expect(404);
    expect((await api('mgrU', 'get', `/learning/skills/people/${ids.arjun}`).expect(200)).body).toMatchObject({ canAssess: true, canDecide: true });
    expect((await api('ldA', 'get', `/learning/skills/people/${ids.arjun}`).expect(200)).body).toMatchObject({ canAssess: false, canDecide: false, suggestions: [] });
    await api('ldA', 'post', `/learning/skills/suggestions/${mine.suggestions[0].id}`).send({ confirm: true }).expect(404);
    await api('imranU', 'post', `/learning/skills/suggestions/${mine.suggestions[0].id}`).send({ confirm: true }).expect(404);
    await api('arjunU', 'post', `/learning/skills/suggestions/${mine.suggestions[0].id}`).send({ confirm: true }).expect(200);
    await api('mgrU', 'post', `/learning/skills/suggestions/${mine.suggestions[0].id}`).send({ confirm: false }).expect(409);
    expect((await api('arjunU', 'get', '/learning/skills/me').expect(200)).body.skills[0]).toMatchObject({ level: 2, source: 'Course', evidence: 'Forklift basics' });
    // Assessing: the manager only, levels 1-5, library skills only.
    await api('arjunU', 'post', `/learning/skills/people/${ids.arjun}/assess`).send({ skillId: skill, level: 5 }).expect(403);
    await api('mgrU', 'post', `/learning/skills/people/${ids.arjun}/assess`).send({ skillId: skill, level: 6 }).expect(400);
    await api('mgrU', 'post', `/learning/skills/people/${ids.arjun}/assess`).send({ skillId: randomUUID(), level: 3 }).expect(400);
    await api('mgrU', 'post', `/learning/skills/people/${ids.arjun}/assess`).send({ skillId: skill, level: 4 }).expect(200);
    const team = (await api('mgrU', 'get', '/learning/skills/team').expect(200)).body;
    expect(team.skills).toEqual(['Forklift handling']);
    expect(team.people.find((p: { name: string }) => p.name === 'Arjun')).toMatchObject({ levels: [4], required: [3] });
    expect((await api('arjunU', 'get', '/learning/skills/team').expect(200)).body.people).toEqual([]);
    ids.forkliftBasics = id;
    ids.forkliftSkill = skill;
  });

  it('G3d needs and budgets: L&D only; a need is for a person or a department; a plan needs its course; spent follows completions', async () => {
    await api('arjunU', 'get', '/learning/needs').expect(403);
    await api('mgrU', 'post', '/learning/budgets').send({ departmentId: ids.deptKF, year: 2026, amount: 100000 }).expect(403);
    const need = { title: 'Forklift refresher for Arjun', source: 'skill_gap', priority: 'high', estCost: 5000, skillId: ids.forkliftSkill };
    await api('ldA', 'post', '/learning/needs').send({ ...need, employeeId: ids.arjun, departmentId: ids.deptKF }).expect(400);
    await api('ldA', 'post', '/learning/needs').send(need).expect(400);
    await api('ldA', 'post', '/learning/needs').send({ ...need, employeeId: ids.arjun, priority: 'urgent' }).expect(400);
    const nid = (await api('ldA', 'post', '/learning/needs').send({ ...need, employeeId: ids.arjun }).expect(201)).body.id;
    await api('ldA', 'patch', '/learning/needs').send({ ids: [nid], status: 'planned' }).expect(400);
    await api('ldA', 'patch', '/learning/needs').send({ ids: [nid, randomUUID()], status: 'closed' }).expect(404);
    await api('ldA', 'patch', '/learning/needs').send({ ids: [nid], status: 'planned', courseId: ids.forkliftBasics }).expect(200);
    expect((await api('ldA', 'get', '/learning/needs').expect(200)).body).toEqual([expect.objectContaining({ who: 'Arjun', source: 'Skill gap', skill: 'Forklift handling', priority: 'High', status: 'Planned', plan: 'Forklift basics', estCost: 5000 })]);
    expect((await api('adminB', 'get', '/learning/needs').expect(200)).body).toEqual([]);
    const fy = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
    await api('ldA', 'post', '/learning/budgets').send({ departmentId: ids.deptKF, year: fy, amount: -1 }).expect(400);
    await api('ldA', 'post', '/learning/budgets').send({ departmentId: randomUUID(), year: fy, amount: 1 }).expect(400);
    await api('ldA', 'post', '/learning/budgets').send({ departmentId: ids.deptKF, year: fy, amount: 4000 }).expect(200);
    const b = (await api('ldA', 'get', `/learning/budgets?year=${fy}`).expect(200)).body;
    // Spent: completed courses (Forklift basics, 5000) plus approved external training of people in the department.
    const external = await tenantPrisma.forTenant(SUPER, (tx) => tx.learningExternalRequest.findMany({ where: { organizationId: org.A.id, status: 'approved', employeeId: { in: [ids.arjun, ids.divya] } } }));
    expect(b.rows.find((r: { dept: string }) => r.dept === 'Quality KF')).toMatchObject({ planned: 4000, spent: 5000 + external.reduce((a, x) => a + Number(x.cost), 0) });
    expect((await api('adminB', 'get', '/learning/budgets').expect(200)).body.rows).toEqual([]);
    // Answer 2676: the export, L&D only, audited.
    await api('arjunU', 'get', `/learning/budgets/export?year=${fy}`).expect(403);
    const csv = (await api('ldA', 'get', `/learning/budgets/export?year=${fy}`).expect(200)).text;
    expect(csv.split('\r\n')[0]).toBe(`Department,Budget FY ${fy}-${String(fy + 1).slice(2)},Spent,Committed,Left`);
    expect(csv).toContain('Quality KF,4000,');
    expect(await audits('learning.budgets.exported')).toHaveLength(1);
  });

  it('answers 2620 and 2624: HR counts of the committees (company-wide training reports only, none below 5); POSH course completions count', async () => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.speakupTeamMember.create({ data: { organizationId: org.A.id, team: 'ic', userId: users.mgrU, role: 'presiding', woman: true } }));
    const posh = (await api('ldA', 'post', '/learning/admin/courses').send({ ...course, title: 'POSH awareness', mandatory: false, certificate: false, skills: [], poshAwareness: true }).expect(201)).body.id;
    const item = (await api('ldA', 'post', `/learning/admin/courses/${posh}/items`).send({ title: 'What the law says', kind: 'link', minutes: 10, required: true, url: 'https://example.test/posh' }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${posh}/status`).send({ status: 'published', version: 1 }).expect(200);
    const e = (await api('imranU', 'post', `/learning/courses/${posh}/enrol`).send({}).expect(201)).body;
    await api('imranU', 'post', `/learning/enrolments/${e.id ?? e.enrolmentId}/items/${item}/done`).expect(200);
    // 2624: the committee's annual report counts the completion next to the sessions logged by hand.
    expect((await api('mgrU', 'get', '/desk/speakup/ic').expect(200)).body.reports[0]).toMatchObject({ committee: 'Whole company', sessions: 0, trainings: 1 });
    // 2620: training reports for the whole company see counts; fewer than 5 complaints show none.
    await api('arjunU', 'get', '/desk/speakup/ic/counts').expect(403);
    await api('hrTn', 'get', '/desk/speakup/ic/counts').expect(403);
    const counts = (await api('ldA', 'get', '/desk/speakup/ic/counts').expect(200)).body;
    expect(counts).toEqual({ minimum: 5, committees: [expect.objectContaining({ committee: 'Whole company', shown: false, received: null, disposed: null, pendingOver90: null, trainings: 1 })] });
    expect(JSON.stringify(counts)).not.toMatch(/Divya|Imran/);
    expect((await api('adminB', 'get', '/desk/speakup/ic/counts').expect(200)).body.committees).toEqual([]);
  });

  it('answers 2672, 2673, 2675: a course gives its level per skill; a self-added skill waits for the manager; the manager raises a need', async () => {
    // 2672: each course skill gives its own level; the levels must match the skills.
    const reach = await tenantPrisma.forTenant(SUPER, async (tx) => (await tx.companySkill.create({ data: { organizationId: org.A.id, name: 'Reach truck', kind: 'skill', parentId: (await tx.companySkill.findFirstOrThrow({ where: { organizationId: org.A.id, name: 'Safety', kind: 'domain' } })).id } })).id);
    const base = { ...course, title: 'Reach truck advanced', mandatory: false, certificate: false, skills: ['Reach truck', 'Forklift handling'] };
    await api('ldA', 'post', '/learning/admin/courses').send({ ...base, skillLevels: [4] }).expect(400);
    await api('ldA', 'post', '/learning/admin/courses').send({ ...base, skillLevels: [6, 2] }).expect(400);
    const cid = (await api('ldA', 'post', '/learning/admin/courses').send({ ...base, skillLevels: [4, 5] }).expect(201)).body.id;
    const item = (await api('ldA', 'post', `/learning/admin/courses/${cid}/items`).send({ title: 'Video', kind: 'link', minutes: 5, required: true, url: 'https://example.test/reach' }).expect(201)).body.id;
    await api('ldA', 'post', `/learning/admin/courses/${cid}/status`).send({ status: 'published', version: 1 }).expect(200);
    const e = (await api('imranU', 'post', `/learning/courses/${cid}/enrol`).send({}).expect(201)).body;
    await api('imranU', 'post', `/learning/enrolments/${e.id ?? e.enrolmentId}/items/${item}/done`).expect(200);
    const imran = (await api('imranU', 'get', '/learning/skills/me').expect(200)).body.suggestions.map((x: { skill: string; level: number }) => [x.skill, x.level]);
    expect(imran).toEqual(expect.arrayContaining([['Reach truck', 4], ['Forklift handling', 5]]));

    // 2673: Arjun adds a skill to his own profile; only his manager decides it.
    await api('arjunU', 'post', '/learning/skills/me').send({ skillId: randomUUID(), level: 3 }).expect(400);
    await api('arjunU', 'post', '/learning/skills/me').send({ skillId: reach, level: 0 }).expect(400);
    await api('arjunU', 'post', '/learning/skills/me').send({ skillId: ids.forkliftSkill, level: 3 }).expect(400); // he holds level 4 already
    expect((await api('arjunU', 'post', '/learning/skills/me').send({ skillId: reach, level: 3, note: 'Drove one for two years' }).expect(201)).body.manager).toBe(true);
    await api('arjunU', 'post', '/learning/skills/me').send({ skillId: reach, level: 3 }).expect(409);
    const mine = (await api('arjunU', 'get', '/learning/skills/me').expect(200)).body.suggestions.find((x: { skill: string }) => x.skill === 'Reach truck');
    expect(mine).toMatchObject({ level: 3, from: 'Added by the person', evidence: 'Drove one for two years', canDecide: false });
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users.mgrU, type: 'learning.skill_added', entityId: mine.id } }))).toBe(1);
    await api('arjunU', 'post', `/learning/skills/suggestions/${mine.id}`).send({ confirm: true }).expect(403);
    await api('imranU', 'post', `/learning/skills/suggestions/${mine.id}`).send({ confirm: true }).expect(404);
    expect((await api('mgrU', 'get', `/learning/skills/people/${ids.arjun}`).expect(200)).body.suggestions.find((x: { id: string }) => x.id === mine.id)).toMatchObject({ canDecide: true });
    await api('mgrU', 'post', `/learning/skills/suggestions/${mine.id}`).send({ confirm: true }).expect(200);
    expect((await api('arjunU', 'get', '/learning/skills/me').expect(200)).body.skills.find((x: { name: string }) => x.name === 'Reach truck')).toMatchObject({ level: 3, source: 'Self, confirmed by the manager' });
    expect(await audits('learning.skill.self_added')).toHaveLength(1);

    // 2675: the manager raises a training need for his report from the team skills; L&D sees it in Needs.
    const team = (await api('mgrU', 'get', '/learning/skills/team').expect(200)).body;
    expect(team.skillIds).toEqual([ids.forkliftSkill]);
    const need = { employeeId: ids.arjun, skillId: ids.forkliftSkill, title: 'Forklift handling for Arjun', priority: 'medium' };
    await api('arjunU', 'post', '/learning/skills/team/needs').send(need).expect(403);
    await api('ldA', 'post', '/learning/skills/team/needs').send(need).expect(403);
    await api('imranU', 'post', '/learning/skills/team/needs').send(need).expect(404);
    await api('adminB', 'post', '/learning/skills/team/needs').send(need).expect(404);
    await api('mgrU', 'post', '/learning/skills/team/needs').send({ ...need, priority: 'urgent' }).expect(400);
    // The planned need from L&D for this skill is still open, so a second one is refused; another skill is fine.
    await api('mgrU', 'post', '/learning/skills/team/needs').send(need).expect(409);
    const nid = (await api('mgrU', 'post', '/learning/skills/team/needs').send({ ...need, skillId: reach, title: 'Reach truck for Arjun' }).expect(201)).body.id;
    expect((await api('ldA', 'get', '/learning/needs').expect(200)).body.find((n: { id: string }) => n.id === nid)).toMatchObject({ who: 'Arjun', source: 'Skill gap', skill: 'Reach truck', priority: 'Medium', status: 'New', estCost: 0 });
    expect(await audits('learning.need.raised')).toHaveLength(1);
  });
});
