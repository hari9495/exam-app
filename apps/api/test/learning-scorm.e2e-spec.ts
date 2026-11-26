import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import JSZip from 'jszip';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { readToken, signToken } from '../src/learning/scorm';

// Answer 2781: SCORM 1.2 and 2004 against the real database (forced RLS). L&D uploads a zip (limits, manifest), every
// unpacked file is virus-checked and served only from the content origin with a signed token and the CSP; the learner's
// commits keep only the allowed fields and complete the course through the usual path. Keys, company and enrolment
// boundaries on each.
describe('Learning: SCORM packages (answer 2781)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const APP = 'http://app.scorm-e2e.test';
  const CONTENT = 'http://content.scorm-e2e.test:8443';
  const env0 = { WEB_ORIGIN: process.env.WEB_ORIGIN, SCORM_CONTENT_ORIGIN: process.env.SCORM_CONTENT_ORIGIN };

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'ldA' | 'arjunU' | 'imranU' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@scorm.test`;
  const audits = (action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));
  const content = (path: string, host = 'content.scorm-e2e.test:8443') => request(server()).get(`/api/v1/scorm/${path}`).set('Host', host);

  const MANIFEST_12 = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="m" version="1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="o"><organization identifier="o"><title>Fire drill</title><item identifier="i" identifierref="r"><title>Drill</title></item></organization></organizations>
  <resources><resource identifier="r" type="webcontent" adlcp:scormtype="sco" href="index.html"/></resources>
</manifest>`;
  const MANIFEST_2004 = MANIFEST_12.replace('<schemaversion>1.2</schemaversion>', '<schemaversion>2004 4th Edition</schemaversion>').replace('href="index.html"', 'href="sco/start.html"');
  const zip = async (files: Record<string, string>) => {
    const z = new JSZip();
    for (const [n, d] of Object.entries(files)) z.file(n, d);
    return Buffer.from(await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
  };
  const upload = (who: Who, courseId: string, data: Buffer, title = 'Fire drill package') =>
    api(who, 'post', `/learning/admin/courses/${courseId}/items`).field('title', title).field('kind', 'scorm').field('minutes', '15').field('required', 'true').attach('file', data, 'package.zip');
  const filesOf = (itemId: string) => tenantPrisma.forTenant(SUPER, async (tx) => tx.file.findMany({ where: { id: { in: (await tx.learningScormFile.findMany({ where: { itemId } })).map((f) => f.fileId) } } }));
  const waitClean = async (itemId: string) => {
    for (let i = 0; i < 100; i++) {
      const fs = await filesOf(itemId);
      if (fs.length && fs.every((f) => f.scanStatus === 'clean')) return fs;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('files never came back clean');
  };

  beforeAll(async () => {
    process.env.SD_SCANNER = process.env.SD_SCANNER ?? 'dev-fake';
    process.env.WEB_ORIGIN = APP;
    process.env.SCORM_CONTENT_ORIGIN = CONTENT;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `scorm-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Scorm Org ${k}`, slug: `scorm-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.le = (await tx.legalEntity.create({ data: { ...o, name: 'Entity KF', shortName: 'KF', isDefault: true, employeeCodePrefix: 'KF' } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.le, name: 'Site KF', code: 'KF', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const id = randomUUID();
      await tx.department.create({ data: { ...o, id, name: 'Quality', code: 'Q', path: `/${id}/` } });
      ids.dept = id;
      ids.des = (await tx.designation.create({ data: { ...o, name: 'Line Operator', code: 'LO' } })).id;
      ids.type = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'P', category: 'permanent' } })).id;
    });
    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hr = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override'], 'HR');
    const ld = await profile(['learning.manage', 'learning.report.view'], 'L&D');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hrA', 'A', 'panel', hr],
      ['ldA', 'A', 'panel', ld],
      ['arjunU', 'A', 'panel', null],
      ['imranU', 'A', 'panel', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    const hire = async (givenName: string, code: string, user: Who) => {
      const id = (
        await api('hrA', 'post', '/people/employees')
          .send({ legalEntityId: ids.le, employeeCode: code, givenName, familyName: 'Kumar', status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: addDays(today, -400), assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.des, employmentTypeId: ids.type, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
      await tenantPrisma.forTenant(SUPER, (tx) => tx.employee.update({ where: { id }, data: { userId: users[user] } }));
      return id;
    };
    ids.arjun = await hire('Arjun', 'KF0142', 'arjunU');
    ids.imran = await hire('Imran', 'KF0143', 'imranU');
  }, 180_000);

  afterAll(async () => {
    process.env.WEB_ORIGIN = env0.WEB_ORIGIN;
    process.env.SCORM_CONTENT_ORIGIN = env0.SCORM_CONTENT_ORIGIN;
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

  it('L&D uploads a SCORM zip: refused when broken or escaping; only learning.manage; not another company', async () => {
    ids.course = (await api('ldA', 'post', '/learning/admin/courses').send({ title: 'Fire drill', source: 'company', durationMinutes: 15, cost: 0, mandatory: false, needsApproval: false, certificate: true, certificateMonths: 12, skills: [] }).expect(201)).body.id;
    const good = await zip({ 'imsmanifest.xml': MANIFEST_12, 'index.html': '<html><head><title>Drill</title></head><body>Drill</body></html>', 'js/app.js': 'var x = 1;' });
    await upload('hrA', ids.course, good).expect(403);
    await upload('adminB', ids.course, good).expect(404);
    expect((await upload('ldA', ids.course, await zip({ 'index.html': 'x' })).expect(400)).body.message).toMatch(/no imsmanifest.xml/);
    expect((await upload('ldA', ids.course, await zip({ 'imsmanifest.xml': MANIFEST_12, 'index.html': 'x', '../evil.js': 'x' })).expect(400)).body.message).toMatch(/outside the package/);
    expect((await upload('ldA', ids.course, await zip({ 'imsmanifest.xml': '<manifest><broken', 'index.html': 'x' })).expect(400)).body.message).toMatch(/not valid XML/);
    expect((await upload('ldA', ids.course, Buffer.from('%PDF-1.4 not a zip')).expect(400)).body.message).toMatch(/not a zip/);
    await api('ldA', 'post', `/learning/admin/courses/${ids.course}/items`).field('title', 'No file').field('kind', 'scorm').field('minutes', '1').field('required', 'true').expect(400);
    const made = (await upload('ldA', ids.course, good).expect(201)).body;
    expect(made).toMatchObject({ version: '1.2', files: 3 });
    ids.item = made.id;
    const item2004 = (await upload('ldA', ids.course, await zip({ 'imsmanifest.xml': MANIFEST_2004, 'sco/start.html': '<p>2004</p>' }), 'Allergen package').expect(201)).body;
    expect(item2004.version).toBe('2004');
    ids.item2004 = item2004.id;
    await api('ldA', 'patch', `/learning/admin/courses/${ids.course}/items/${ids.item2004}`).send({ required: false }).expect(200);
    const builder = (await api('ldA', 'get', `/learning/admin/courses/${ids.course}`).expect(200)).body;
    expect(builder.items.map((i: { kind: string; scormVersion: string }) => [i.kind, i.scormVersion])).toEqual([['SCORM', '1.2'], ['SCORM', '2004']]);
    expect((await audits('learning.course.item_added')).map((a) => JSON.parse(a.metadataJson ?? '{}').kind)).toEqual(['scorm', 'scorm']);
    await api('ldA', 'post', `/learning/admin/courses/${ids.course}/status`).send({ status: 'published', version: 1 }).expect(200);
    await waitClean(ids.item);
    await waitClean(ids.item2004);
  });

  it('the player gives a launch link on the content origin, for the page that asked', async () => {
    ids.enrol = (await api('arjunU', 'post', `/learning/courses/${ids.course}/enrol`).expect(201)).body.id;
    await api('imranU', 'get', `/learning/enrolments/${ids.enrol}`).expect(404);
    await api('adminB', 'get', `/learning/enrolments/${ids.enrol}`).expect(404);
    const player = (await api('arjunU', 'get', `/learning/enrolments/${ids.enrol}`).set('Origin', 'https://evil.test').expect(200)).body;
    const s = player.items[0].scorm;
    expect(s).toMatchObject({ version: '1.2', status: 'incomplete', score: null });
    expect(s.launchUrl).toMatch(new RegExp(`^${CONTENT}/api/v1/scorm/[^/]+/index\\.html$`));
    const t = readToken(s.launchUrl.split('/')[6])!;
    // A page of another origin never becomes the frame's parent: the web origin is used.
    expect(t).toMatchObject({ o: org.A.id, i: ids.item, e: ids.enrol, a: APP });
    ids.token = s.launchUrl.split('/')[6];
    ids.token2004 = player.items[1].scorm.launchUrl.split('/')[6];
    // A package is never marked done by hand.
    await api('arjunU', 'post', `/learning/enrolments/${ids.enrol}/items/${ids.item}/done`).expect(400);
  });

  it('serves files only on the content origin, with a valid token, for that package, once clean; with the CSP and no cookies', async () => {
    const page = await content(`${ids.token}/index.html`).expect(200);
    expect(page.headers['content-type']).toMatch(/^text\/html/);
    expect(page.headers['set-cookie']).toBeUndefined();
    expect(page.headers['content-security-policy']).toContain(`script-src ${CONTENT} 'unsafe-inline' 'unsafe-eval'`);
    expect(page.headers['content-security-policy']).toContain(`frame-ancestors ${APP} ${CONTENT}`);
    expect(page.headers['content-security-policy']).toContain('sandbox allow-scripts allow-forms');
    expect(page.headers['x-content-type-options']).toBe('nosniff');
    expect(page.text).toContain(`<head><script src="/api/v1/scorm/${ids.token}/__yx/api.js"></script><title>Drill</title>`);
    expect((await content(`${ids.token}/js/app.js`).expect(200)).headers['content-type']).toMatch(/javascript/);
    // The run-time with the bridge: posts only to the app origin.
    const rt = await content(`${ids.token}/__yx/api.js`).expect(200);
    expect(rt.text).toContain('Scorm12API');
    expect(rt.text).toContain(`"app":"${APP}"`);
    expect(rt.text).toContain('"cmi.core.student_name":"Kumar, Arjun"');
    // On the app's own host: nothing.
    await content(`${ids.token}/index.html`, 'app.scorm-e2e.test').expect(404);
    // Unsigned, tampered, expired, or signed for another package.
    await content(`${ids.token.split('.')[0]}/index.html`).expect(403);
    await content(`${ids.token.slice(0, -2)}aa/index.html`).expect(403);
    const t = readToken(ids.token)!;
    await content(`${signToken({ ...t, x: Date.now() - 1000 })}/index.html`).expect(403);
    await content(`${ids.token2004}/index.html`).expect(404);
    await content(`${ids.token}/sco/start.html`).expect(404);
    // Another company's token names its own company: none of A's packages.
    await content(`${signToken({ ...t, o: org.B.id })}/index.html`).expect(404);
    // A file that has not passed the virus check is never served.
    // (A verdict is final in the database, so two more files of the package are added as they would stand.)
    const [f] = (await filesOf(ids.item)).filter((x) => x.fileName === 'app.js');
    for (const status of ['pending', 'infected']) {
      await tenantPrisma.forTenant(SUPER, async (tx) => {
        const row = await tx.file.create({ data: { organizationId: org.A.id, area: 'learning', storageRef: f.storageRef, fileName: `${status}.js`, mime: 'text/javascript', size: f.size, sha256: f.sha256, scanStatus: status, uploadedVia: 'staff' } });
        await tx.learningScormFile.create({ data: { organizationId: org.A.id, itemId: ids.item, path: `${status}.js`, fileId: row.id } });
      });
      await content(`${ids.token}/${status}.js`).expect(403);
    }
  });

  it('a commit keeps only the allowed fields; oversize suspend data is refused; only the learner', async () => {
    const path = `/learning/enrolments/${ids.enrol}/items/${ids.item}/scorm`;
    const out = (await api('arjunU', 'post', path).send({ cmi: { 'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': 'p3', 'cmi.suspend_data': 'resume-here', 'cmi.core.student_name': 'Someone else', 'cmi.interactions': {}, 'cmi.comments': 'x' } }).expect(200)).body;
    expect(out).toMatchObject({ status: 'incomplete', completed: false });
    const saved = await tenantPrisma.forTenant(SUPER, (tx) => tx.learningScormAttempt.findUniqueOrThrow({ where: { enrolmentId_itemId: { enrolmentId: ids.enrol, itemId: ids.item } } }));
    expect(saved.cmi).toEqual({ 'cmi.core.lesson_status': 'incomplete', 'cmi.core.lesson_location': 'p3', 'cmi.suspend_data': 'resume-here' });
    expect((await api('arjunU', 'get', '/learning/me').expect(200)).body.enrolments[0].status).toBe('In progress');
    await api('arjunU', 'post', path).send({ cmi: { 'cmi.suspend_data': 'x'.repeat(64_001) } }).expect(400);
    await api('arjunU', 'post', path).send({ cmi: 'not an object' }).expect(400);
    await api('imranU', 'post', path).send({ cmi: { 'cmi.core.lesson_status': 'passed' } }).expect(404);
    await api('adminB', 'post', path).send({ cmi: { 'cmi.core.lesson_status': 'passed' } }).expect(404);
    // A link item's id is not a package.
    await api('arjunU', 'post', `/learning/enrolments/${ids.enrol}/items/${randomUUID()}/scorm`).send({ cmi: {} }).expect(404);
    // Resume: the saved values are loaded into the run-time, entry is resume.
    const rt = (await content(`${ids.token}/__yx/api.js`).expect(200)).text;
    expect(rt).toContain('"cmi.suspend_data":"resume-here"');
    expect(rt).toContain('"cmi.core.entry":"resume"');
  });

  it('the package reports passed: the required item is done and the course completes with its certificate', async () => {
    const out = (await api('arjunU', 'post', `/learning/enrolments/${ids.enrol}/items/${ids.item}/scorm`).send({ cmi: { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '90', 'cmi.core.score.max': '100' } }).expect(200)).body;
    expect(out).toMatchObject({ status: 'completed', score: '90 of 100', completed: true, certificateId: expect.any(String) });
    const me = (await api('arjunU', 'get', '/learning/me').expect(200)).body;
    expect(me.enrolments[0]).toMatchObject({ status: 'Completed', progress: 100 });
    expect(me.certificates).toHaveLength(1);
    expect(await audits('learning.scorm.finished')).toHaveLength(1);
    expect(await audits('learning.completed')).toHaveLength(1);
    // The optional 2004 package still saves for resume; its status shows.
    const p2004 = (await api('arjunU', 'post', `/learning/enrolments/${ids.enrol}/items/${ids.item2004}/scorm`).send({ cmi: { 'cmi.completion_status': 'completed', 'cmi.success_status': 'failed', 'cmi.score.scaled': '0.4', 'cmi.core.lesson_status': 'passed' } }).expect(200)).body;
    expect(p2004).toMatchObject({ status: 'failed', score: '40%', completed: true });
    const player = (await api('arjunU', 'get', `/learning/enrolments/${ids.enrol}`).expect(200)).body;
    expect(player.items.map((i: { done: boolean; scorm: { status: string } }) => [i.done, i.scorm.status])).toEqual([
      [true, 'completed'],
      [false, 'failed'],
    ]);
  });
});
