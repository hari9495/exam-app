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
import { CompanyDocsService } from '../src/library/company-docs.service';
import { ReportSchedulesService } from '../src/library/report-schedules.service';

// G4, end to end against the real database (forced RLS, the app role): the report library (each entry by its area's
// key or being a manager; personal favourites) and company documents (folders for everyone or the managers, upload with
// the virus check, download audited, expiry reminders once); two companies kept apart. Positive and negative.
process.env.SD_SCANNER = 'dev-fake';
describe('G4 reports library and company documents', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let docs: CompanyDocsService;
  const sent: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'emp1' | 'emp2' | 'noJob' | 'empB' | 'mgr' | 'r1' | 'r2' | 'r3';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string; attachments?: { filename: string; content: Buffer }[] }) => (sent.push(m), { success: true })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    docs = moduleRef.get(CompanyDocsService);

    planId = (await prisma.plan.create({ data: { name: `g4-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `G4 Org ${k}`, slug: `g4-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', 'hr_admin'],
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['noJob', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${tpl}-${run}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === tpl)!.permissions) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@g4-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@g4-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const)
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `ENG Foods ${k}`, shortName: `EN${k}-${run}`, isDefault: true } })).id;
        for (const [code, name] of [['HSR', 'Hosur plant'], ['BLR', 'Bengaluru'], ['MAA', 'Chennai']] as const)
          ids[`${code}${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name, code, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        for (const code of ['ENG', 'OPS']) {
          const id = randomUUID();
          ids[`${code}${k}`] = (await tx.department.create({ data: { ...o, id, name: code, code, path: `/${id}/` } })).id;
        }
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENGR' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    const hire = async (who: Who, k: 'A' | 'B', loc: string, dept: string, manager: string | null = null) =>
      api(k === 'A' ? 'adminA' : 'adminB', 'post', '/people/employees')
        .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[who], workEmail: `${who}@g4-${run}.test`, assignment: { locationId: ids[`${loc}${k}`], departmentId: ids[`${dept}${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
        .expect(201);
    await hire('hr', 'A', 'BLR', 'ENG');
    ids.mgrEmp = (await hire('mgr', 'A', 'HSR', 'OPS')).body.id;
    await hire('emp1', 'A', 'HSR', 'OPS', ids.mgrEmp);
    await hire('emp2', 'A', 'BLR', 'ENG');
    await hire('empB', 'B', 'HSR', 'OPS');
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

  it('the report library: each person sees only what their keys open (or their team, as a manager); favourites are their own', async () => {
    const ids_ = async (who: Who) => (await api(who, 'get', '/library/reports').expect(200)).body.map((r: { id: string }) => r.id);
    expect(await ids_('emp1')).toEqual([]);
    const mgr = await ids_('mgr');
    expect(mgr).toEqual(expect.arrayContaining(['time.attendance', 'learning.team', 'learning.team-skills']));
    expect(mgr).not.toContain('pay.register');
    const hr = await ids_('hr');
    expect(hr).toEqual(expect.arrayContaining(['learning.compliance']));
    // Pay keys are granted, never part of the System Admin role, so pay reports stay out of their library.
    const admin = await ids_('adminA');
    expect(admin).toEqual(expect.arrayContaining(['exp.summary', 'learning.compliance']));
    expect(admin).not.toContain('pay.register');
    await api('emp1', 'post', '/library/reports/pay.register/favourite').send({ on: true }).expect(404);
    await api('hr', 'post', '/library/reports/learning.compliance/favourite').send({ on: 'yes' }).expect(400);
    await api('hr', 'post', '/library/reports/learning.compliance/favourite').send({ on: true }).expect(200);
    expect((await api('hr', 'get', '/library/reports').expect(200)).body.find((r: { id: string }) => r.id === 'learning.compliance')).toMatchObject({ favourite: true, question: 'Are people trained for their work?', href: '/yx/learning/compliance' });
    expect((await api('adminA', 'get', '/library/reports').expect(200)).body.find((r: { id: string }) => r.id === 'learning.compliance')).toMatchObject({ favourite: false });
    await api('hr', 'post', '/library/reports/learning.compliance/favourite').send({ on: false }).expect(200);
    expect((await api('hr', 'get', '/library/reports').expect(200)).body.find((r: { id: string }) => r.id === 'learning.compliance').favourite).toBe(false);
  });

  it('company documents: managers make folders and upload; everyone reads "everyone" folders; a managers folder is hidden; the file opens only when clean', async () => {
    await api('emp1', 'post', '/library/documents/folders').send({ name: 'Licences', audience: 'everyone' }).expect(403);
    await api('hr', 'post', '/library/documents/folders').send({ name: 'L', audience: 'everyone' }).expect(400);
    await api('hr', 'post', '/library/documents/folders').send({ name: 'Licences', audience: 'all' }).expect(400);
    ids.lic = (await api('hr', 'post', '/library/documents/folders').send({ name: 'Licences', audience: 'everyone' }).expect(201)).body.id;
    await api('adminA', 'post', '/library/documents/folders').send({ name: 'licences', audience: 'everyone' }).expect(409);
    ids.hrOnly = (await api('adminA', 'post', '/library/documents/folders').send({ name: 'Board papers', audience: 'managers' }).expect(201)).body.id;
    const up = (who: Who, fields: Record<string, string>, file: Buffer | null = PDF, name = 'factory-licence.pdf') => {
      let r = api(who, 'post', '/library/documents');
      for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
      return file ? r.attach('file', file, name) : r;
    };
    await up('emp1', { folderId: ids.lic, title: 'Factory licence' }).expect(403);
    await up('hr', { folderId: ids.lic, title: 'Factory licence' }, null).expect(400);
    await up('hr', { folderId: ids.lic, title: 'Factory licence', expiresOn: shift(-1) }).expect(400);
    await up('hr', { folderId: ids.lic, title: 'Fake', expiresOn: shift(20) }, Buffer.from('<html></html>'), 'fake.pdf').expect(400);
    await up('hr', { folderId: '00000000-0000-4000-8000-000000000000', title: 'Factory licence' }).expect(404);
    ids.doc = (await up('hr', { folderId: ids.lic, title: 'Factory licence', expiresOn: shift(20) }).expect(201)).body.id;
    ids.board = (await up('adminA', { folderId: ids.hrOnly, title: 'Board minutes' }).expect(201)).body.id;
    await new Promise((r) => setTimeout(r, 300));
    const mine = (await api('emp1', 'get', '/library/documents').expect(200)).body;
    expect(mine).toMatchObject({ canManage: false, folders: [{ name: 'Licences', count: 1 }], folderId: ids.lic });
    expect(mine.documents).toEqual([expect.objectContaining({ title: 'Factory licence', status: 'Expiring soon', expiresOn: shift(20), size: PDF.length })]);
    await api('emp1', 'get', `/library/documents?folderId=${ids.hrOnly}`).expect(404);
    await api('emp1', 'get', `/library/documents/${ids.board}/file`).expect(404);
    expect((await api('hr', 'get', '/library/documents').expect(200)).body.folders.map((f: { name: string }) => f.name)).toEqual(['Board papers', 'Licences']);
    const f = await api('emp1', 'get', `/library/documents/${ids.doc}/file`).expect(200);
    expect(f.headers['content-disposition']).toMatch(/factory-licence\.pdf/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'company_docs.document_downloaded', entityId: ids.doc } }))).toBe(1);
    // Another company sees nothing.
    expect((await api('adminB', 'get', '/library/documents').expect(200)).body.folders).toEqual([]);
    await api('adminB', 'get', `/library/documents/${ids.doc}/file`).expect(404);
    await api('empB', 'get', `/library/documents/${ids.doc}/file`).expect(404);
  });

  it('company documents: replace keeps the record; a folder with documents cannot be removed; the expiry note goes once to the uploader and the managers', async () => {
    const before = await inA((tx) => tx.companyDocument.findUniqueOrThrow({ where: { id: ids.doc } }));
    await api('hr', 'post', '/library/documents').field('folderId', ids.lic).field('title', 'Factory licence 2027').field('expiresOn', shift(25)).field('replaceId', ids.doc).attach('file', PDF, 'factory-licence-2027.pdf').expect(201);
    const after = await inA((tx) => tx.companyDocument.findUniqueOrThrow({ where: { id: ids.doc } }));
    expect(after.fileId).not.toBe(before.fileId);
    expect(after.title).toBe('Factory licence 2027');
    await api('hr', 'post', `/library/documents/folders/${ids.lic}/remove`).expect(409);
    const bells = (who: Who) => inA((tx) => tx.userNotification.count({ where: { recipientUserId: users[who], type: 'people.company_doc.expiring', entityId: ids.doc } }));
    await docs.remindExpiring();
    expect(await bells('hr')).toBe(1);
    expect(await bells('adminA')).toBe(1);
    expect(await bells('emp1')).toBe(0);
    await docs.remindExpiring();
    expect(await bells('hr')).toBe(1);
    // A company that warns 7 days before is not told about one 25 days away.
    await inA((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'company_docs.expiry_reminder_days', value: '7' } }));
    const later = (await api('hr', 'post', '/library/documents').field('folderId', ids.lic).field('title', 'Fire NOC').field('expiresOn', shift(25)).attach('file', PDF, 'fire-noc.pdf').expect(201)).body.id;
    await docs.remindExpiring();
    expect(await inA((tx) => tx.userNotification.count({ where: { type: 'people.company_doc.expiring', entityId: later } }))).toBe(0);
    await api('emp1', 'post', `/library/documents/${later}/remove`).expect(403);
    await api('hr', 'post', `/library/documents/${later}/remove`).expect(200);
    await api('hr', 'post', `/library/documents/${later}/remove`).expect(404);
    await api('hr', 'post', `/library/documents/${ids.doc}/remove`).expect(200);
    await api('hr', 'post', `/library/documents/folders/${ids.lic}/remove`).expect(200);
    expect((await api('emp1', 'get', '/library/documents').expect(200)).body.folders).toEqual([]);
  });
  it('answers 2690 and 2691: schedules for reports the person opens, to people who open them; each copy built for its recipient; confidential ones are a link', async () => {
    const svc = app.get(ReportSchedulesService);
    await api('emp1', 'post', '/library/schedules').send({ reportId: 'learning.compliance', frequency: 'weekly', recipientIds: [users.emp1] }).expect(404);
    await api('adminA', 'post', '/library/schedules').send({ reportId: 'learning.compliance', frequency: 'hourly', recipientIds: [users.adminA] }).expect(400);
    await api('adminA', 'post', '/library/schedules').send({ reportId: 'learning.compliance', frequency: 'weekly', recipientIds: [] }).expect(400);
    await api('adminA', 'post', '/library/schedules').send({ reportId: 'learning.compliance', frequency: 'weekly', recipientIds: [users.emp1] }).expect(400);
    await api('adminA', 'post', '/library/schedules').send({ reportId: 'learning.team', frequency: 'weekly', recipientIds: [users.adminA] }).expect(404);
    const made = (await api('adminA', 'post', '/library/schedules').send({ reportId: 'learning.compliance', frequency: 'weekly', recipientIds: [users.adminA, users.hr] }).expect(201)).body;
    expect(new Date(made.nextRunAt).getUTCDay()).toBe(1);
    const mine = (await api('adminA', 'get', '/library/schedules').expect(200)).body;
    expect(mine.schedules).toEqual([expect.objectContaining({ reportId: 'learning.compliance', frequency: 'weekly', delivery: 'Email · CSV attached' })]);
    expect((await api('hr', 'get', '/library/schedules').expect(200)).body.schedules).toEqual([]);
    // Due: each recipient gets their own CSV; a second run at the same moment sends nothing more.
    const at = new Date(Date.parse(made.nextRunAt) + 60_000);
    sent.length = 0;
    expect(await svc.sendDue(at)).toBe(2);
    expect(sent.map((m) => m.attachments?.[0]?.filename)).toEqual(['compliance-training.csv', 'compliance-training.csv']);
    expect(await svc.sendDue(at)).toBe(0);
    // HR loses training reports: next time only the admin gets it.
    await inA(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: users.hr } });
      const pp = await tx.permissionProfile.findUniqueOrThrow({ where: { id: u.permissionProfileId! } });
      await tx.permissionProfile.update({ where: { id: pp.id }, data: { permissionsJson: JSON.stringify((JSON.parse(pp.permissionsJson) as string[]).filter((k) => k !== 'learning.report.view')) } });
      await tx.reportSchedule.update({ where: { id: made.id }, data: { nextRunAt: new Date(Date.now() - 60_000) } });
    });
    sent.length = 0;
    expect(await svc.sendDue(new Date())).toBe(1);
    expect((await api('adminA', 'get', '/library/schedules').expect(200)).body.schedules[0].lastResult).toBe('Sent to 1 of 2');
    // A confidential report (performance) is a link, never an attachment.
    const perf = (await api('hr', 'post', '/library/schedules').send({ reportId: 'perf.completion', frequency: 'daily', recipientIds: [users.hr] }).expect(201)).body;
    sent.length = 0;
    expect(await svc.sendDue(new Date(Date.parse(perf.nextRunAt) + 60_000))).toBe(1);
    expect(sent[0]!.attachments).toBeUndefined();
    expect(sent[0]!.html).toMatch(/Sign in to YukthiX to open it/);
    await api('hr', 'post', `/library/schedules/${made.id}/end`).expect(404);
    await api('adminA', 'post', `/library/schedules/${made.id}/end`).expect(200);
    expect((await api('adminA', 'get', '/library/schedules').expect(200)).body.schedules).toEqual([]);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'library.report.scheduled' } }))).toBe(2);
  });

  it('answer 2692: the export log lists the company exports for its key holders only, and downloads as CSV', async () => {
    await api('adminA', 'get', '/learning/compliance/export').expect(200);
    await api('emp1', 'get', '/library/exports').expect(403);
    await api('hr', 'get', '/library/exports').expect(403);
    const log = (await api('adminA', 'get', '/library/exports').expect(200)).body;
    expect(log[0]).toMatchObject({ what: 'Training compliance', sensitivity: 'Internal' });
    expect(log.every((r: { what: string }) => r.what !== 'Payslip')).toBe(true);
    await api('adminA', 'get', '/library/exports?from=26-11-2026').expect(400);
    const csv = (await api('adminA', 'get', '/library/exports/csv').expect(200)).text;
    expect(csv.split('\r\n')[0]).toBe('When,Who,What,Detail,Rows,Sensitivity');
    expect(csv).toContain('Training compliance');
    expect((await api('adminA', 'get', '/library/exports').expect(200)).body[0].what).toBe('Export log');
    expect((await api('adminB', 'get', '/library/exports').expect(200)).body).toEqual([]);
  });

  it('T2-G 46: the import log lists each import with who, what, rows in and rows not in, for export-log key holders of the company only', async () => {
    await inA((tx) =>
      tx.auditLog.createMany({
        data: [
          { organizationId: org.A.id, actorUserId: users.hr, actorName: 'HR Person', action: 'employee.import', entityType: 'legal_entity', entityId: ids.entityA, metadataJson: JSON.stringify({ fileName: 'joiners.csv', rows: 12, created: 10, skipped: 2 }) },
          { organizationId: org.A.id, actorUserId: users.hr, actorName: 'HR Person', action: 'payroll.import.staged', entityType: 'pay_import_batch', metadataJson: JSON.stringify({ kind: 'variable_pay', rows: 5, errors: 1 }) },
          { organizationId: org.A.id, actorUserId: users.hr, actorName: 'HR Person', action: 'perf.goal.imported', entityType: 'goal', metadataJson: JSON.stringify({ line: 2 }) },
          { organizationId: org.A.id, action: 'employee.import', entityType: 'legal_entity', metadataJson: 'not json' },
        ],
      }),
    );
    await api('emp1', 'get', '/library/imports').expect(403);
    await api('hr', 'get', '/library/imports').expect(403);
    await api('adminA', 'get', '/library/imports?from=26-11-2026').expect(400);
    const log = (await api('adminA', 'get', '/library/imports').expect(200)).body as { who: string; what: string; detail: string | null; ok: number; failed: number }[];
    expect(log).toHaveLength(3);
    expect(log).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ who: 'HR Person', what: 'Employees', detail: 'joiners.csv', ok: 10, failed: 2 }),
        expect.objectContaining({ what: 'Payroll inputs (checked)', detail: 'variable_pay', ok: 4, failed: 1 }),
        expect.objectContaining({ who: 'System', what: 'Employees', ok: 0, failed: 0 }),
      ]),
    );
    expect((await api('adminB', 'get', '/library/imports').expect(200)).body).toEqual([]);
  });
});
