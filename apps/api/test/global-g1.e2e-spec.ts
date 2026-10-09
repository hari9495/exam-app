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
import { addDays, todayIst } from '../src/org-structure/org-validation';

// Batch G1 · global core (G1-GLOBAL-CORE-BUILD-DESIGN), end to end against the real database (forced RLS, app role):
// the India country pack, a person's language and the company's translated words, leave pay steps, and the
// "Add a country" guide. Hours and service dates are in employee-history.e2e-spec.ts.
describe('Global core G1 (country packs, languages, translations, pay steps, Add a country)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  const ids: Record<string, string> = {};
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'emp' | 'peer';
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const auditActions = async (prefix: string) => (await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: prefix } }, orderBy: { createdAt: 'asc' } }))).map((a) => ({ action: a.action, entityId: a.entityId, metadata: a.metadataJson ? JSON.parse(a.metadataJson) : null }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `g1-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `G1 Org ${k}`, slug: `g1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@g1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@g1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `G1 Foods ${k}`, shortName: `G1${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Stores', code: 'STR', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Store keeper', code: 'SK' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    for (const who of ['emp', 'peer'] as const) {
      ids[who] = (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entityA, status: 'confirmed', reason: 'Joined', givenName: who, joinedOn: addDays(today, -3), userId: users[who], workEmail: `${who}@g1-${run}.test`, assignment: { locationId: ids.locA, departmentId: ids.deptA, designationId: ids.desigA, employmentTypeId: ids.permA, managerEmployeeId: null } })
          .expect(201)
      ).body.id;
    }
  }, 240_000);

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

  describe('country packs (G1.01, G1.04)', () => {
    it('lists the India pack with its defaults; reads its person fields; packs are read-only to the app', async () => {
      const list = (await api('adminA', 'get', '/global/countries').expect(200)).body;
      expect(list).toEqual(expect.arrayContaining([expect.objectContaining({ country: 'IN', name: 'India', currency: 'INR', fyStartMonth: 4, dataRegion: 'IN', normalWeekHours: '48', languages: ['en', 'hi', 'ta', 'te'], registrations: ['IN.PF', 'IN.ESI', 'IN.PT', 'IN.LWF'], verify: true })]));
      const india = (await api('hrAdmin', 'get', '/global/countries/IN').expect(200)).body;
      expect(india.personFields).toMatchObject({ legalName: 'required', pan: 'required', aadhaar: 'optional', religion: 'not_allowed', casteCategory: 'not_allowed', socialSecurityNumber: 'not_allowed' });
      await api('adminA', 'get', '/global/countries/ZZ').expect(404);
      await api('adminA', 'get', '/global/countries/in').expect(404);
      await api('emp', 'get', '/global/countries').expect(403);
      await expect(prisma.$executeRaw`UPDATE statutory_rule_sets SET verify = false WHERE statute = 'IN.PACK'`).rejects.toThrow();
    });
  });

  describe('languages and translations (G1.06)', () => {
    it('a person picks their own language; it falls back to the company language', async () => {
      expect((await api('emp', 'get', '/global/me/language').expect(200)).body).toEqual({ language: 'en', chosen: false, companyLanguage: 'en', choices: ['en', 'hi', 'ta', 'te'] });
      expect((await api('emp', 'put', '/global/me/language').send({ language: 'ta' }).expect(200)).body).toMatchObject({ language: 'ta', chosen: true });
      await api('emp', 'put', '/global/me/language').send({ language: 'fr' }).expect(400);
      // Someone with no employee record has nothing to choose here.
      await api('adminA', 'put', '/global/me/language').send({ language: 'hi' }).expect(400);
      expect((await auditActions('employee.language.changed')).map((a) => a.metadata.to)).toEqual(['ta']);
      // The company's choice for an entity reaches people who did not choose.
      await api('adminA', 'put', '/org/settings').send({ key: 'people.language', scopeType: 'legal_entity', scopeId: ids.entityA, value: 'hi' }).expect(200);
      expect((await api('peer', 'get', '/global/me/language').expect(200)).body).toMatchObject({ language: 'hi', chosen: false, companyLanguage: 'en' });
    });

    it('HR translates the company words; each person sees their language, else the company words', async () => {
      ids.LOP = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'LOP', name: 'Leave without pay', kind: 'lop', paid: false }).expect(201)).body.id;
      const list = (await api('adminA', 'get', '/global/translations?subjectType=leave_type').expect(200)).body;
      expect(list).toMatchObject({ companyLanguage: 'en', languages: ['hi', 'ta', 'te'], items: [{ id: ids.LOP, name: 'Leave without pay', translations: {} }] });
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'leave_type', subjectId: ids.LOP, language: 'ta', text: '  சம்பளமில்லா   விடுப்பு ' }).expect(200);
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'designation', subjectId: ids.desigA, language: 'ta', text: 'கிடங்கு காப்பாளர்' }).expect(200);
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'designation', subjectId: ids.desigA, language: 'hi', text: 'स्टोर कीपर' }).expect(200);
      // My leave and the job record speak the reader's language (Tamil); the peer's entity language is Hindi.
      const mine = (await api('emp', 'get', '/time/me/leave').expect(200)).body.balances.find((b: { code: string }) => b.code === 'LOP');
      expect(mine.name).toBe('சம்பளமில்லா விடுப்பு');
      expect((await api('peer', 'get', '/time/me/leave').expect(200)).body.balances.find((b: { code: string }) => b.code === 'LOP').name).toBe('Leave without pay');
      expect((await api('emp', 'get', `/people/employees/${ids.emp}/as-of`).expect(200)).body.assignment.designation.name).toBe('கிடங்கு காப்பாளர்');
      expect((await api('peer', 'get', `/people/employees/${ids.peer}/as-of`).expect(200)).body.assignment.designation.name).toBe('स्टोर कीपर');
      // HR without an employee record reads the company words.
      expect((await api('hrAdmin', 'get', `/people/employees/${ids.emp}/as-of`).expect(200)).body.assignment.designation.name).toBe('Store keeper');
      // Clearing removes it; the company language is not a translation; other companies' subjects do not exist here.
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'designation', subjectId: ids.desigA, language: 'hi', text: null }).expect(200);
      expect((await api('peer', 'get', `/people/employees/${ids.peer}/as-of`).expect(200)).body.assignment.designation.name).toBe('Store keeper');
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'leave_type', subjectId: ids.LOP, language: 'en', text: 'Unpaid' }).expect(400);
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'designation', subjectId: ids.desigB, language: 'ta', text: 'x' }).expect(404);
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'payslip', subjectId: ids.desigA, language: 'ta', text: 'x' }).expect(400);
      await api('adminA', 'put', '/global/translations').send({ subjectType: 'designation', subjectId: ids.desigA, language: 'ta', text: 'x'.repeat(151) }).expect(400);
      await api('emp', 'put', '/global/translations').send({ subjectType: 'designation', subjectId: ids.desigA, language: 'ta', text: 'x' }).expect(403);
      expect((await api('adminB', 'get', '/global/translations?subjectType=designation').expect(200)).body.items.map((i: { translations: object }) => i.translations)).toEqual([{}]);
      expect((await auditActions('org.translation.')).map((a) => a.action)).toEqual(['org.translation.saved', 'org.translation.saved', 'org.translation.saved', 'org.translation.removed']);
    });
  });

  describe('leave pay steps (G1.05)', () => {
    it('a paid type keeps its steps; editing it without them keeps them; an unpaid type has none', async () => {
      const steps = [{ days: 10, percent: 100 }, { days: 20, percent: 50 }];
      ids.SL = (await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'SL', name: 'Sick leave', kind: 'sick', paid: true, rules: { paySteps: steps, payWindow: 'rolling_12_months' } }).expect(201)).body.id;
      const rules = async () => (await api('hrAdmin', 'get', '/time/setup').expect(200)).body.types.find((t: { id: string }) => t.id === ids.SL).rules;
      expect(await rules()).toMatchObject({ paySteps: steps, payWindow: 'rolling_12_months' });
      await api('hrAdmin', 'put', `/time/setup/types/${ids.SL}`).send({ code: 'SL', name: 'Sick leave', kind: 'sick', paid: true, rules: { medical: true } }).expect(200);
      expect(await rules()).toMatchObject({ paySteps: steps, payWindow: 'rolling_12_months', medical: true });
      await api('hrAdmin', 'put', `/time/setup/types/${ids.SL}`).send({ code: 'SL', name: 'Sick leave', kind: 'sick', paid: true, rules: { paySteps: null } }).expect(200);
      expect((await rules()).paySteps).toBeNull();
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'UL', name: 'Unpaid', kind: 'other', paid: false, rules: { paySteps: steps } }).expect(400);
      await api('hrAdmin', 'post', '/time/setup/types').send({ code: 'XL', name: 'X', kind: 'other', paid: true, rules: { paySteps: [{ days: 5, percent: 120 }] } }).expect(400);
    });
  });

  describe('the "Add a country" guide (G1.07)', () => {
    it('India through the guide: a new entity, its checklist closing item by item, then finished', async () => {
      await api('adminA', 'post', '/global/country-setups').send({ country: 'ZZ' }).expect(400);
      await api('emp', 'post', '/global/country-setups').send({ country: 'IN' }).expect(403);
      const started = (await api('adminA', 'post', '/global/country-setups').send({ country: 'IN' }).expect(201)).body;
      expect(started).toMatchObject({ country: 'IN', countryName: 'India', status: 'in_progress', legalEntity: null, open: 1 });
      // Step 2: the entity with the pack's defaults.
      const entity = (await api('adminA', 'post', '/org/legal-entities').send({ name: 'Kaveri South India', shortName: `KSI-${run}`, country: 'IN', currency: 'INR', fyStartMonth: 4, dataRegion: 'IN' }).expect(201)).body;
      ids.ksi = entity.id;
      await api('adminA', 'put', `/global/country-setups/${started.id}`).send({ legalEntityId: ids.entityB, version: started.version }).expect(404);
      const linked = (await api('adminA', 'put', `/global/country-setups/${started.id}`).send({ legalEntityId: ids.ksi, version: started.version }).expect(200)).body;
      const open = (s: { checklist: { key: string; done: boolean }[] }) => s.checklist.filter((i) => !i.done).map((i) => i.key);
      expect(open(linked)).toEqual(['id:pan', 'id:tan', 'reg:IN.PF', 'reg:IN.ESI', 'reg:IN.PT', 'reg:IN.LWF', 'location', 'holidays', 'leave']);
      await api('adminA', 'put', `/global/country-setups/${started.id}`).send({ legalEntityId: ids.ksi, version: started.version }).expect(409);
      // One guide per entity.
      await api('adminA', 'post', '/global/country-setups').send({ country: 'IN', legalEntityId: ids.ksi }).expect(409);
      // Steps 3-5 happen on their own screens (identifiers, Payroll set-up, locations, leave set-up); the list follows.
      await inA((tx) => tx.legalEntity.update({ where: { id: ids.ksi }, data: { pan: 'AABCK1234M', tan: 'MAAK01234E' } }));
      await inA((tx) => tx.statutoryRegistration.create({ data: { organizationId: org.A.id, legalEntityId: ids.ksi, statute: 'IN.PF', status: 'on', registrationNo: 'TNMAS0012345000', startOn: new Date(`${today}T00:00:00Z`) } }));
      await api('adminA', 'post', '/org/locations').send({ legalEntityId: ids.ksi, name: 'Madurai depot', address: { lines: ['1 Main Road'], city: 'Madurai', state: 'IN-TN', postalCode: '625001', country: 'IN' }, timezone: 'Asia/Kolkata' }).expect(201);
      const now = (await api('adminA', 'get', '/global/country-setups').expect(200)).body.find((s: { id: string }) => s.id === started.id);
      expect(open(now)).toEqual(['reg:IN.ESI', 'reg:IN.PT', 'reg:IN.LWF', 'holidays', 'leave']);
      expect(now.checklist.find((i: { key: string }) => i.key === 'holidays').href).toBe('/yx/time/setup');
      // Finish is allowed with items open; the list stays; a finished guide is closed.
      await api('adminA', 'post', `/global/country-setups/${started.id}/finish`).send({ version: 1 }).expect(409);
      const done = (await api('adminA', 'post', `/global/country-setups/${started.id}/finish`).send({ version: now.version }).expect(201)).body;
      expect(done).toMatchObject({ status: 'done', open: 5 });
      await api('adminA', 'post', `/global/country-setups/${started.id}/finish`).send({ version: done.version }).expect(409);
      expect((await auditActions('org.country_setup.')).map((a) => a.action)).toEqual(['org.country_setup.started', 'org.country_setup.entity', 'org.country_setup.finished']);
    });

    it('another company neither sees nor changes the guide', async () => {
      expect((await api('adminB', 'get', '/global/country-setups').expect(200)).body).toEqual([]);
      const mine = (await api('adminA', 'get', '/global/country-setups').expect(200)).body[0];
      await api('adminB', 'post', `/global/country-setups/${mine.id}/finish`).send({ version: mine.version }).expect(404);
      await api('adminB', 'post', '/global/country-setups').send({ country: 'IN', legalEntityId: ids.ksi }).expect(404);
    });
  });
});
