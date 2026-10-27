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
import { markSteppedUp } from './fixtures/step-up';
import { lapsedWorkPermits, WorkAuthService } from '../src/people/work-auth.service';

// The last People pages, against the real database (forced RLS): the identity panel (PPL-34) and work
// authorisations (PPL-45). Each with its key,
// scope and company boundary, positive and negative.
describe('People: the remaining designed pages (PPL-34, PPL-45)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const joined = addDays(todayIst(), -400);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'hrPlain' | 'hrTn' | 'arjunU' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const up = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@gaps.test`;
  const audits = (action: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `gaps-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `gaps-${k.toLowerCase()}-${runId}`, planId } });
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
        ids[`des${tag}`] = (await tx.designation.create({ data: { ...o, name: `Analyst ${tag}`, code: `AN${tag}` } })).id;
        ids[`type${tag}`] = (await tx.employmentType.create({ data: { ...o, name: `Permanent ${tag}`, code: `P${tag}`, category: 'permanent' } })).id;
      });
    await masters('A', 'KF', true);
    await masters('A', 'TN', false);
    await masters('B', 'BB', true);

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hrKeys = ['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'employee.identity.view', 'employee.identity.manage'];
    const hr = await profile([...hrKeys, 'employee.aadhaar.view'], 'HR');
    const hrPlain = await profile(hrKeys, 'HR without Special');
    ids.plant = await profile(['employee.profile.view', 'employee.aadhaar.view'], 'Plant HR');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hrA', 'A', 'panel', hr],
      ['hrPlain', 'A', 'panel', hrPlain],
      ['hrTn', 'A', 'panel', null],
      ['arjunU', 'A', 'panel', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    // Plant HR: the Special key for the TN entity only.
    await tenantPrisma.forTenant(ctx('A'), (tx) =>
      tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrTn, permissionProfileId: ids.plant, scopeType: 'legal_entity', legalEntityId: ids.leTN, validFrom: new Date(`${addDays(todayIst(), -30)}T00:00:00Z`), status: 'active', reason: 'Plant HR' } }),
    );
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (tag: string, givenName: string, code: string, extra: Record<string, unknown> = {}) =>
      (
        await api('hrA', 'post', '/people/employees')
          .send({ legalEntityId: ids[`le${tag}`], employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids[`loc${tag}`], departmentId: ids[`dept${tag}`], designationId: ids[`des${tag}`], employmentTypeId: ids[`type${tag}`], managerEmployeeId: null }, ...extra })
          .expect(201)
      ).body.id as string;
    ids.arjun = await hire('KF', 'Arjun', 'KF0142', { workEmail: email('arjunU'), userId: users.arjunU });
    ids.imran = await hire('TN', 'Imran', 'TN0001');
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

  // ------------------------------------------------------------------------------------------ identity panel (PPL-34)

  describe('identity panel (PPL-34)', () => {
    const path = (who: string) => `/people/employees/${ids[who]}/identity-checks`;

    it('is Special class: HR with the Special key in scope only, never the person or another company; every look recorded', async () => {
      await api('hrPlain', 'get', path('arjun')).expect(403);
      await api('arjunU', 'get', path('arjun')).expect(403);
      await api('adminB', 'get', path('arjun')).expect(403);
      await api('hrTn', 'get', path('arjun')).expect(404); // outside the plant's entity
      const panel = (await api('hrA', 'get', path('arjun')).expect(200)).body;
      expect(panel).toEqual({ checks: [], idTypes: expect.arrayContaining([{ key: 'passport', name: 'Passport' }, { key: 'pan_card', name: 'PAN card' }]), canManage: true });
      expect(panel.idTypes).toHaveLength(3);
      const plant = (await api('hrTn', 'get', path('imran')).expect(200)).body;
      expect(plant.canManage).toBe(false);
      expect((await audits('employee.identity_checks.viewed')).map((a) => a.entityId).sort()).toEqual([ids.arjun, ids.imran].sort());
      // The person sees the look in "Who accessed my data", as Special.
      const log = (await api('arjunU', 'get', '/people/me/access-log').expect(200)).body;
      expect(log.entries).toEqual([expect.objectContaining({ what: 'Identity checks', context: 'The identity panel on your record', className: 'special' })]);
    });

    it('HR attests (step-up) and asks for a fresh ID; the person is told; nobody else may', async () => {
      await api('hrA', 'post', `${path('arjun')}/attest`).send({ note: 'Original passport seen' }).expect(403); // step-up
      await up('hrA');
      await api('hrA', 'post', `${path('arjun')}/attest`).send({ note: 'x'.repeat(501) }).expect(400);
      await api('hrA', 'post', `${path('arjun')}/attest`).send({ note: 'Original passport seen' }).expect(201);
      await api('hrA', 'post', `${path('arjun')}/reverify`).send({ typeKey: 'bank_proof' }).expect(400);
      await api('hrA', 'post', `${path('arjun')}/reverify`).send({ typeKey: 'passport' }).expect(201);
      await up('hrTn');
      await api('hrTn', 'post', `${path('imran')}/attest`).send({}).expect(403); // no identity.manage
      await up('hrPlain');
      await api('hrPlain', 'post', `${path('arjun')}/reverify`).send({ typeKey: 'passport' }).expect(403);
      const panel = (await api('hrA', 'get', path('arjun')).expect(200)).body;
      expect(panel.checks).toEqual([
        { kind: 'attested', at: expect.any(String), by: email('hrA'), note: 'Original passport seen' },
        { kind: 'requested', at: expect.any(String), by: email('hrA'), note: 'Passport' },
      ]);
      expect((await audits('employee.identity.attested')).length).toBe(1);
      expect((await audits('employee.identity.reverify_requested')).length).toBe(1);
      const told = await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, recipientUserId: users.arjunU, type: 'document.requested' } }));
      expect(told.map((n) => n.contextText)).toEqual(['Please upload a fresh copy of your Passport to verify your identity again']);
    });

    it('checks are append-only for the app', async () => {
      await expect(tenantPrisma.forTenant(ctx('A'), (tx) => tx.personIdentityCheck.deleteMany({ where: { organizationId: org.A.id } }))).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------------------------------ work authorisations (PPL-45)

  describe('work authorisations (PPL-45)', () => {
    const path = (who: string) => `/people/employees/${ids[who]}/work-authorisations`;
    const visa = { kind: 'employment_visa', country: 'AE', number: '784 2025 7731', sponsor: 'Kaveri Foods FZE', occupation: 'Quality Inspector', issuedOn: addDays(todayIst(), -300), expiresOn: addDays(todayIst(), 50) };

    it('HR with identity access reads them, masked; identity.manage adds one after step-up; nobody else', async () => {
      await api('arjunU', 'get', path('arjun')).expect(403);
      await api('adminB', 'get', path('arjun')).expect(403);
      await api('hrTn', 'get', path('imran')).expect(403); // the plant HR has no identity view
      expect((await api('hrA', 'get', path('arjun')).expect(200)).body).toEqual({ designation: 'Analyst KF', reminderDays: [90, 60, 30], rows: [] });
      await up('hrPlain');
      await api('hrPlain', 'post', path('arjun')).send({ ...visa, country: 'XX' }).expect(400);
      await api('hrPlain', 'post', path('arjun')).send({ ...visa, kind: 'tourist_visa' }).expect(400);
      await api('hrPlain', 'post', path('arjun')).send({ ...visa, number: '1' }).expect(400);
      await api('hrPlain', 'post', path('arjun')).send({ ...visa, expiresOn: visa.issuedOn }).expect(400);
      await api('hrPlain', 'post', path('arjun')).send(visa).expect(201);
      await up('arjunU');
      await api('arjunU', 'post', path('arjun')).send(visa).expect(403);
      const list = (await api('hrA', 'get', path('arjun')).expect(200)).body;
      expect(list.rows).toEqual([{ id: expect.any(String), kind: 'employment_visa', country: 'AE', number: '•••• 7731', sponsor: 'Kaveri Foods FZE', occupation: 'Quality Inspector', issuedOn: visa.issuedOn, expiresOn: visa.expiresOn, remindedDays: [] }]);
      expect(JSON.stringify(list)).not.toContain('784');
      const stored = await tenantPrisma.forTenant(SUPER, (tx) => tx.workAuthorisation.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(stored.numberEnc).not.toContain('7731');
      const audit = await audits('employee.work_auth.added');
      expect(audit).toHaveLength(1);
      expect(audit[0].metadataJson).not.toContain('7731');
    });

    it('reminds the person once per reminder day, the latest reached, and the company may switch it off', async () => {
      const service = app.get(WorkAuthService);
      expect(await service.remind()).toBe(1); // 50 days left: the 60-day reminder
      expect(await service.remind()).toBe(0);
      expect(await service.remind(addDays(todayIst(), 25))).toBe(1); // 25 days left: the 30-day reminder
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.workAuthorisation.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(row.remindedDays).toEqual([60, 30]);
      const told = await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { organizationId: org.A.id, recipientUserId: users.arjunU, type: 'document.expiring' } }));
      expect(told).toBe(2);
      await tenantPrisma.forTenant(ctx('A'), (tx) => tx.setting.create({ data: { organizationId: org.A.id, key: 'work_auth.reminder_days', scopeType: 'tenant', scopeId: org.A.id, value: 'off' } }));
      expect((await api('hrA', 'get', path('arjun')).expect(200)).body.reminderDays).toEqual([]);
      await tenantPrisma.forTenant(SUPER, (tx) => tx.workAuthorisation.updateMany({ where: { organizationId: org.A.id }, data: { remindedDays: [] } }));
      expect(await service.remind()).toBe(0);
    });

    it('payroll pre-flight: only an expired visa or permit for the entity’s country, and a renewal clears it', async () => {
      const lapsed = (on: string, country = 'AE') => tenantPrisma.forTenant(ctx('A'), (tx) => lapsedWorkPermits(tx, org.A.id, country, [ids.arjun, ids.imran], new Date(`${on}T00:00:00Z`)));
      expect(await lapsed(addDays(todayIst(), 10))).toEqual([]);
      expect(await lapsed(addDays(todayIst(), 60))).toEqual([ids.arjun]);
      expect(await lapsed(addDays(todayIst(), 60), 'IN')).toEqual([]);
      await up('hrA');
      await api('hrA', 'post', path('arjun')).send({ ...visa, number: '784 2026 9001', issuedOn: undefined, expiresOn: addDays(todayIst(), 400) }).expect(201);
      expect(await lapsed(addDays(todayIst(), 60))).toEqual([]);
    });
  });
});
