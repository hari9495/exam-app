import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';

// PPL-03 "Additional details" end to end against the real database (forced RLS): HR defines the company's employee
// fields with a data class (People settings, org.settings.manage), and each value reaches only the viewers its class
// allows — Public to colleagues, Internal to the manager and HR in scope, Personal to the person and
// employee.personal.view, Confidential (masked) to the person and employee.identity.view. Editing follows the same
// classes; every change is audited without values; another company sees nothing.
describe('People: Additional details (employee custom fields)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'hrBasic' | 'hrPersonal' | 'mgr' | 'emp' | 'col' | 'none';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Field = { id: string; label: string; dataClass: string; value: string | number | null; canEdit: boolean };
  const read = async (who: Who, status = 200) => (await api(who, 'get', `/people/employees/${ids.empEmp}/custom-fields`).expect(status)).body as { fields: Field[] };
  const shown = (body: { fields: Field[] }) => Object.fromEntries(body.fields.map((f) => [f.label, f.value]));
  const set = (who: Who, values: Record<string, unknown>) => api(who, 'put', `/people/employees/${ids.empEmp}/custom-fields`).send({ values });

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

    const planId = (await prisma.plan.create({ data: { name: `cf-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CF Org ${k}`, slug: `cf-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', [...ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions]],
      ['hrBasic', 'A', 'panel', ['employee.profile.view', 'employee.profile.edit']],
      ['hrPersonal', 'A', 'panel', ['employee.profile.view', 'employee.profile.edit', 'employee.personal.view']],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['col', 'A', 'panel', null],
      ['none', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@cf-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@cf-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.e1 = (await tx.legalEntity.create({ data: { ...o, name: 'CF Foods', shortName: `CF-${run}`, isDefault: true } })).id;
      ids.l1 = (await tx.location.create({ data: { ...o, legalEntityId: ids.e1, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Inspector', code: 'IN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, code: string, manager: string | null) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.e1, status: 'confirmed', reason: 'Joined', overrideReason: 'Records moved in from the old system', givenName: who, familyName: run, employeeCode: code, joinedOn: '2024-01-08', userId: users[who], workEmail: `${who}@cf-${run}.test`, assignment: { locationId: ids.l1, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('mgr', 'CF-001', null);
    ids.empEmp = await hire('emp', 'CF-002', ids.mgrEmp);
    ids.colEmp = await hire('col', 'CF-003', null);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  it('HR defines employee fields in People settings; the hiring settings route never reaches them', async () => {
    await api('emp', 'get', '/people/custom-fields').expect(403);
    await api('hrBasic', 'post', '/people/custom-fields').send({ entityType: 'employee', label: 'Locker', fieldType: 'text', dataClass: 'public' }).expect(403);
    const make = async (label: string, fieldType: string, dataClass: string, options?: string[]) =>
      (await api('hr', 'post', '/people/custom-fields').send({ entityType: 'employee', label, fieldType, dataClass, ...(options ? { options } : {}) }).expect(201)).body as { id: string; dataClass: string };
    const shirt = await make('T-shirt size', 'select', 'public', ['S', 'M', 'L', 'XL']);
    expect(shirt.dataClass).toBe('public');
    ids.pub = shirt.id;
    ids.int = (await make('Forklift licence number', 'text', 'internal')).id;
    ids.per = (await make('Blood group', 'select', 'personal', ['A positive', 'B positive', 'O positive'])).id;
    ids.conf = (await make('Gate pass number', 'text', 'confidential')).id;
    await api('hr', 'post', '/people/custom-fields').send({ entityType: 'candidate', label: 'X', fieldType: 'text' }).expect(400);
    await api('hr', 'post', '/people/custom-fields').send({ entityType: 'employee', label: 'X', fieldType: 'text', dataClass: 'secret' }).expect(400);
    // The hiring route (org:manage_settings) neither creates nor edits employee fields.
    await api('adminA', 'post', '/custom-fields').send({ entityType: 'employee', label: 'X', fieldType: 'text' }).expect(400);
    await api('adminA', 'patch', `/custom-fields/${ids.pub}`).send({ label: 'Renamed' }).expect(404);
    await api('emp', 'post', '/custom-fields').send({ entityType: 'job', label: 'X', fieldType: 'text' }).expect(403);
    const list = (await api('hr', 'get', '/people/custom-fields').expect(200)).body as { label: string; dataClass: string }[];
    expect(list.map((f) => [f.label, f.dataClass])).toEqual([['T-shirt size', 'public'], ['Forklift licence number', 'internal'], ['Blood group', 'personal'], ['Gate pass number', 'confidential']]);
    // Another company's settings stay apart.
    expect((await api('adminB', 'get', '/people/custom-fields').expect(200)).body).toEqual([]);
    await api('adminB', 'put', `/people/custom-fields/${ids.pub}`).send({ label: 'Mine' }).expect(404);
  });

  it('HR sets the values; the audit names the fields, never the values', async () => {
    const body = (await set('hr', { [ids.pub]: 'L', [ids.int]: 'TN70 2019 0004412', [ids.per]: 'B positive', [ids.conf]: 'GP-778899' }).expect(200)).body as { fields: Field[] };
    expect(shown(body)).toEqual({ 'T-shirt size': 'L', 'Forklift licence number': 'TN70 2019 0004412', 'Blood group': 'B positive', 'Gate pass number': '•••• 8899' });
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'employee.custom_fields.updated', entityId: ids.empEmp } }));
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0].metadataJson!)).toEqual({ fields: ['t_shirt_size', 'forklift_licence_number', 'blood_group', 'gate_pass_number'], by: 'hr' });
    expect(audits[0].metadataJson).not.toMatch(/0004412|B positive|778899/);
    await set('hr', { [ids.pub]: 'XXL' }).expect(400); // not one of the choices
  });

  it('each viewer reads only the classes theirs to see; nothing else is sent', async () => {
    const col = await read('col');
    expect(shown(col)).toEqual({ 'T-shirt size': 'L' });
    expect(JSON.stringify(col)).not.toMatch(/0004412|B positive|8899|Forklift|Blood|Gate/);
    expect(col.fields[0].canEdit).toBe(false);
    expect(shown(await read('mgr'))).toEqual({ 'T-shirt size': 'L', 'Forklift licence number': 'TN70 2019 0004412' });
    expect(shown(await read('hrBasic'))).toEqual({ 'T-shirt size': 'L', 'Forklift licence number': 'TN70 2019 0004412' });
    expect(shown(await read('hrPersonal'))).toEqual({ 'T-shirt size': 'L', 'Forklift licence number': 'TN70 2019 0004412', 'Blood group': 'B positive' });
    expect(shown(await read('hr'))).toEqual({ 'T-shirt size': 'L', 'Forklift licence number': 'TN70 2019 0004412', 'Blood group': 'B positive', 'Gate pass number': '•••• 8899' });
    const self = await read('emp');
    expect(shown(self)).toEqual({ 'T-shirt size': 'L', 'Forklift licence number': 'TN70 2019 0004412', 'Blood group': 'B positive', 'Gate pass number': '•••• 8899' });
    expect(self.fields.filter((f) => f.canEdit).map((f) => f.label)).toEqual(['Blood group']);
    // No employee record here and no HR key, or another company: the same answer as an unknown person.
    await read('none', 404);
    await read('adminB', 404);
    await api('col', 'get', `/people/employees/${randomUUID()}/custom-fields`).expect(404);
  });

  it('editing follows the classes: the person their Personal fields only, HR what they read with employee.profile.edit', async () => {
    await set('emp', { [ids.per]: 'O positive' }).expect(200);
    await set('emp', { [ids.pub]: 'M' }).expect(403);
    await set('emp', { [ids.int]: 'X' }).expect(403);
    await set('mgr', { [ids.int]: 'X' }).expect(403);
    await set('col', { [ids.pub]: 'M' }).expect(403);
    await set('hrBasic', { [ids.per]: 'A positive' }).expect(403); // cannot read Personal, so cannot write it
    await set('hrBasic', { [ids.conf]: 'GP-1' }).expect(403);
    await set('hrBasic', { [ids.int]: 'TN70 2020 0000001', [ids.pub]: null }).expect(200);
    await set('hrPersonal', { [ids.per]: 'A positive' }).expect(200);
    await set('hr', { [randomUUID()]: 'x' }).expect(403); // unknown field: the same answer as a hidden one
    await set('hr', {}).expect(403);
    await set('adminB', { [ids.pub]: 'M' }).expect(404);
    expect(shown(await read('hr'))).toEqual({ 'T-shirt size': null, 'Forklift licence number': 'TN70 2020 0000001', 'Blood group': 'A positive', 'Gate pass number': '•••• 8899' });
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'employee.custom_fields.updated', entityId: ids.empEmp }, orderBy: { createdAt: 'asc' } }));
    expect(audits.map((a) => JSON.parse(a.metadataJson!).by)).toEqual(['hr', 'self', 'hr', 'hr']);
  });

  it('an archived field disappears from the record and cannot be written', async () => {
    await api('hr', 'post', `/people/custom-fields/${ids.conf}/archive`).expect(201);
    expect(Object.keys(shown(await read('hr')))).not.toContain('Gate pass number');
    await set('hr', { [ids.conf]: 'GP-2' }).expect(403);
  });
});
