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
import { tradingDaysFrom } from '../src/people/preclearance.service';

// The last People pages, against the real database (forced RLS): the identity panel (PPL-34) and work
// authorisations (PPL-45), international bank details (PPL-46), disability declarations (PPL-38), possible same person, merge and
// unmerge (PPL-36/37), BFSI declarations (PPL-43), trading pre-clearance (PPL-44). Each with its key,
// scope and company boundary, positive and negative.
describe('People: the remaining designed pages (PPL-34, PPL-45, PPL-46, PPL-38, PPL-36, PPL-37, PPL-43, PPL-44)', () => {
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
  const hire = async (tag: string, givenName: string, code: string, extra: Record<string, unknown> = {}) =>
    (
      await api('hrA', 'post', '/people/employees')
        .send({ legalEntityId: ids[`le${tag}`], employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids[`loc${tag}`], departmentId: ids[`dept${tag}`], designationId: ids[`des${tag}`], employmentTypeId: ids[`type${tag}`], managerEmployeeId: null }, ...extra })
        .expect(201)
    ).body.id as string;
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
    const hr = await profile([...hrKeys, 'employee.aadhaar.view', 'employee.identity.approve'], 'HR');
    const hrPlain = await profile(hrKeys, 'HR without Special');
    ids.plant = await profile(['employee.profile.view', 'employee.aadhaar.view', 'employee.disability.view', 'compliance.declaration.manage'], 'Plant HR');
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
      expect(list.rows).toEqual([{ id: expect.any(String), kind: 'employment_visa', country: 'AE', number: 'XXXX-7731', sponsor: 'Kaveri Foods FZE', occupation: 'Quality Inspector', issuedOn: visa.issuedOn, expiresOn: visa.expiresOn, remindedDays: [] }]);
      expect(JSON.stringify(list)).not.toContain('784');
      const stored = await tenantPrisma.forTenant(SUPER, (tx) => tx.workAuthorisation.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(stored.numberEnc).not.toContain('7731');
      const audit = await audits('employee.work_auth.added');
      expect(audit).toHaveLength(1);
      expect(audit[0].metadataJson).not.toContain('7731');
    });

    it('reminds the person once per reminder day, the latest reached, and the company may switch it off', async () => {
      const service = app.get(WorkAuthService);
      expect(await service.remind()).toBe(3); // 50 days left: the 60-day reminder, to Arjun and the two HR who can record a renewal
      expect(await service.remind()).toBe(0);
      expect(await service.remind(addDays(todayIst(), 25))).toBe(3); // 25 days left: the 30-day reminder
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.workAuthorisation.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(row.remindedDays).toEqual([60, 30]);
      const told = await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { organizationId: org.A.id, recipientUserId: users.arjunU, type: 'document.expiring' } }));
      // HR is told too (founder 27 Oct 2026), with a link to the record; the plant HR without identity.manage is not.
      const hr = await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, type: 'work_auth.expiring' } }));
      expect(hr.map((n) => n.recipientUserId).sort()).toEqual([users.hrA, users.hrA, users.hrPlain, users.hrPlain].sort());
      expect(hr[0]).toMatchObject({ linkPath: `/yx/people/directory/${ids.arjun}`, contextText: expect.stringMatching(/^Arjun's employment visa expires on .*Record the renewal/) });
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

  // ------------------------------------------------------------------------------------------ international bank (PPL-46)

  describe('international bank details (PPL-46)', () => {
    const raise = (who: Who, employee: string, value: Record<string, string>) => api(who, 'post', `/people/employees/${ids[employee]}/profile-requests`).send({ kind: 'bank_international', value });
    const good = { country: 'AE', iban: 'AE070331234567890123456', bic: 'ECBKAEAD', currency: 'AED' };

    it('the IBAN, BIC, country and currency are checked by the API; the person raises it after step-up', async () => {
      await up('arjunU');
      await raise('arjunU', 'arjun', { ...good, iban: 'AE070331234567890123457' }).expect(400); // check digits
      await raise('arjunU', 'arjun', { ...good, iban: 'AE07033123456789012345' }).expect(400); // UAE length
      await raise('arjunU', 'arjun', { ...good, country: 'GB' }).expect(400); // the IBAN is from another country
      await raise('arjunU', 'arjun', { ...good, bic: 'ECB1' }).expect(400);
      await raise('arjunU', 'arjun', { ...good, currency: 'XYZ' }).expect(400);
      await raise('arjunU', 'arjun', { ...good, ifsc: 'HDFC0001234' }).expect(400);
      await raise('arjunU', 'imran', good).expect(404); // someone else's: not even found
      const r = (await raise('arjunU', 'arjun', good).expect(201)).body;
      expect(r).toMatchObject({ kind: 'bank_international', label: 'Salary account abroad', proposed: { country: 'AE', iban: '•••• 3456', bic: 'ECBKAEAD', currency: 'AED' }, current: null });
      await raise('arjunU', 'arjun', good).expect(409);
      ids.intlReq = r.id;
    });

    it('HR approves (never their own); it shows masked on the record; a replacement waits for the cooling period', async () => {
      await up('hrA');
      await api('hrA', 'post', `/people/profile-requests/${ids.intlReq}/approve`).send({}).expect(201);
      const identity = (await api('hrA', 'get', `/people/employees/${ids.arjun}/profile`).expect(200)).body.identity;
      expect(identity.internationalAccount).toMatchObject({ country: 'AE', iban: '•••• 3456', bic: 'ECBKAEAD', currency: 'AED' });
      expect(JSON.stringify(identity)).not.toContain('0123456');
      const stored = await tenantPrisma.forTenant(SUPER, (tx) => tx.employeeIntlBankAccount.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(stored.ibanEnc).not.toContain('AE07');
      // HR raises a replacement for Arjun; HR cannot approve their own request.
      const next = (await raise('hrA', 'arjun', { country: 'GB', iban: 'GB82WEST12345698765432', bic: 'NWBKGB2L', currency: 'GBP' }).expect(201)).body;
      expect(next.current).toMatchObject({ iban: '•••• 3456' });
      await api('hrA', 'post', `/people/profile-requests/${next.id}/approve`).send({}).expect(403);
      await tenantPrisma.forTenant(SUPER, (tx) => tx.employeeProfileRequest.update({ where: { id: next.id }, data: { requestedBy: users.hrPlain } }));
      await api('hrA', 'post', `/people/profile-requests/${next.id}/approve`).send({}).expect(201);
      const now = (await api('hrA', 'get', `/people/employees/${ids.arjun}/profile`).expect(200)).body.identity.internationalAccount;
      expect(now).toMatchObject({ country: 'GB', iban: '•••• 5432' });
      expect(new Date(now.usableFrom).getTime()).toBeGreaterThan(Date.now() + 47 * 3_600_000);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.employeeIntlBankAccount.count({ where: { organizationId: org.A.id, validTo: null } }))).toBe(1);
    });

    it('the same IBAN on another person needs a reason to approve', async () => {
      await up('hrPlain');
      const r = (await raise('hrPlain', 'imran', { country: 'GB', iban: 'GB82WEST12345698765432', bic: 'NWBKGB2L', currency: 'GBP' }).expect(201)).body;
      await api('hrA', 'post', `/people/profile-requests/${r.id}/approve`).send({}).expect(409);
      await api('hrA', 'post', `/people/profile-requests/${r.id}/approve`).send({ overrideReason: 'Joint account of a married couple' }).expect(201);
    });
  });

  // ------------------------------------------------------------------------------------------ disability (PPL-38)

  describe('disability declaration (PPL-38)', () => {
    const certificate = (employee: string, typeKey = 'disability_certificate') =>
      tenantPrisma.forTenant(ctx('A'), async (tx) => {
        const personId = (await tx.employee.findFirstOrThrow({ where: { id: ids[employee] } })).personId!;
        return (await tx.document.create({ data: { organizationId: org.A.id, personId, typeKey, status: 'uploaded' } })).id;
      });

    it('the person declares with consent; a "Yes" needs its details and their own certificate', async () => {
      const yes = { consent: true, answer: 'yes', category: 'Low vision', percent: 60, certificateDocumentId: await certificate('arjun'), adjustments: 'Screen reader' };
      expect((await api('arjunU', 'get', '/people/me/disability').expect(200)).body).toMatchObject({ company: 'Org A', declaration: null });
      await api('arjunU', 'put', '/people/me/disability').send({ ...yes, consent: false }).expect(400);
      await api('arjunU', 'put', '/people/me/disability').send({ ...yes, category: 'Tired' }).expect(400);
      await api('arjunU', 'put', '/people/me/disability').send({ ...yes, percent: 101 }).expect(400);
      await api('arjunU', 'put', '/people/me/disability').send({ ...yes, certificateDocumentId: undefined }).expect(400);
      await api('arjunU', 'put', '/people/me/disability').send({ ...yes, certificateDocumentId: await certificate('imran') }).expect(400);
      await api('arjunU', 'put', '/people/me/disability').send({ ...yes, certificateDocumentId: await certificate('arjun', 'pan_card') }).expect(400);
      await api('arjunU', 'put', '/people/me/disability').send({ consent: true, answer: 'no', category: 'Low vision' }).expect(400);
      await api('arjunU', 'put', '/people/me/disability').send(yes).expect(200);
      const mine = (await api('arjunU', 'get', '/people/me/disability').expect(200)).body.declaration;
      expect(mine).toMatchObject({ answer: 'yes', category: 'Low vision', percent: 60, adjustments: 'Screen reader', certificate: { status: 'uploaded', validUntil: null } });
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.disabilityDeclaration.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(row.detailsEnc).not.toContain('Low vision');
      const a = (await audits('employee.disability.declared'))[0];
      expect(a.metadataJson).not.toContain('Low vision');
    });

    it('only the HR diversity role in scope sees the list, each look recorded; never HR without it, a manager or the person', async () => {
      await api('hrA', 'get', '/people/disability-declarations').expect(403);
      await api('arjunU', 'get', '/people/disability-declarations').expect(403);
      expect((await api('hrTn', 'get', '/people/disability-declarations').expect(200)).body.rows).toEqual([]); // Arjun is outside the plant
      await tenantPrisma.forTenant(ctx('A'), (tx) => tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrPlain, permissionProfileId: ids.plant, scopeType: 'tenant', validFrom: new Date(`${addDays(todayIst(), -1)}T00:00:00Z`), status: 'active', reason: 'Diversity role' } }));
      const rows = (await api('hrPlain', 'get', '/people/disability-declarations').expect(200)).body.rows;
      expect(rows).toEqual([{ employeeId: ids.arjun, name: 'Arjun', category: 'Low vision', percent: 60, validUntil: null, verified: false, expiringSoon: false }]);
      expect((await audits('employee.disability.viewed')).map((x) => x.entityId)).toEqual([ids.arjun]);
      const log = (await api('arjunU', 'get', '/people/me/access-log').expect(200)).body.entries;
      expect(log).toEqual(expect.arrayContaining([expect.objectContaining({ what: 'Disability declaration', className: 'special' })]));
    });

    it('withdrawing clears what was declared; nothing is left to list', async () => {
      await api('arjunU', 'post', '/people/me/disability/withdraw').expect(201);
      await api('arjunU', 'post', '/people/me/disability/withdraw').expect(404);
      expect((await api('arjunU', 'get', '/people/me/disability').expect(200)).body.declaration).toBeNull();
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.disabilityDeclaration.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(row).toMatchObject({ detailsEnc: null, certificateDocumentId: null });
      expect((await api('hrPlain', 'get', '/people/disability-declarations').expect(200)).body.rows).toEqual([]);
      await api('arjunU', 'put', '/people/me/disability').send({ consent: true, answer: 'skip' }).expect(200);
      expect((await api('arjunU', 'get', '/people/me/disability').expect(200)).body.declaration).toMatchObject({ answer: 'skip' });
    });
  });

  // ------------------------------------------------------------------------------------------ same person (PPL-36/37)

  describe('possible same person, merge and unmerge (PPL-36, PPL-37)', () => {
    // A login that raised a desk ticket before it was linked got a person of its own (no email, no employee record).
    const loose = async (tag: string) => {
      const userId = (await tenantPrisma.forTenant(ctx('A'), (tx) => tx.user.create({ data: { organizationId: org.A.id, email: email(tag), passwordHash: 'x', role: 'panel' } }))).id;
      users[tag] = userId;
      return tenantPrisma.forTenant(ctx('A'), async (tx) => {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: `${tag} desk` } });
        await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: userId, startOn: new Date(`${todayIst()}T00:00:00Z`) } });
        return p.id;
      });
    };
    const personOf = (employee: string) => tenantPrisma.forTenant(SUPER, async (tx) => (await tx.employee.findFirstOrThrow({ where: { id: ids[employee] } })).personId!);

    beforeAll(async () => {
      ids.meena = await hire('KF', 'Meena', 'KF0300', { workEmail: email('meenaU') });
      ids.ravi = await hire('KF', 'Ravi', 'KF0301', { workEmail: email('raviU') });
      ids.meenaLoose = await loose('meenaU');
      ids.raviLoose = await loose('raviU');
      ids.nobody = await loose('nobodyU');
      ids.meenaP = await personOf('meena');
      ids.raviP = await personOf('ravi');
    });

    it('lists a login whose email is another person’s work email, for HR company-wide only', async () => {
      await api('hrTn', 'get', '/people/same-person').expect(403);
      await api('arjunU', 'get', '/people/same-person').expect(403);
      const rows = (await api('hrA', 'get', '/people/same-person').expect(200)).body.rows;
      expect(rows.map((r: { a: { personId: string }; b: { personId: string } }) => [r.a.personId, r.b.personId]).sort()).toEqual([[ids.meenaLoose, ids.meenaP], [ids.raviLoose, ids.raviP]].sort());
      const meena = rows.find((r: { a: { personId: string } }) => r.a.personId === ids.meenaLoose);
      expect(meena).toMatchObject({ basis: ['login email'], a: { name: 'meenaU desk', email: email('meenaU'), role: 'Login' }, b: { name: 'Meena', email: email('meenaU'), role: 'Employee · KF0300' } });
    });

    it('not the same person: logged and never proposed again', async () => {
      await api('hrA', 'post', '/people/same-person/not-same').send({ personId: ids.meenaLoose, intoPersonId: ids.raviP }).expect(404); // not a proposal
      await api('hrA', 'post', '/people/same-person/not-same').send({ personId: ids.meenaLoose, intoPersonId: ids.meenaP, note: 'A namesake' }).expect(201);
      const rows = (await api('hrA', 'get', '/people/same-person').expect(200)).body.rows;
      expect(rows.map((r: { a: { personId: string } }) => r.a.personId)).toEqual([ids.raviLoose]);
      await up('hrA');
      await api('hrA', 'post', '/people/same-person/merge').send({ personId: ids.meenaLoose, intoPersonId: ids.meenaP, keep: { name: 'b', email: 'b', phone: 'b' }, note: 'x' }).expect(404);
    });

    it('merge keeps the chosen fields, moves the roles and links the login to the employee record; unmerge puts it all back', async () => {
      const merge = { personId: ids.raviLoose, intoPersonId: ids.raviP, keep: { name: 'a', email: 'a', phone: 'b' } };
      await api('hrA', 'post', '/people/same-person/merge').send({ ...merge, note: '' }).expect(400);
      await api('hrA', 'post', '/people/same-person/merge').send({ ...merge, keep: { name: 'c', email: 'a', phone: 'b' }, note: 'x' }).expect(400);
      await api('hrA', 'post', '/people/same-person/merge').send({ ...merge, note: 'Same work email; confirmed by phone' }).expect(201);
      const after = await tenantPrisma.forTenant(SUPER, async (tx) => ({
        a: await tx.person.findFirstOrThrow({ where: { id: ids.raviLoose } }),
        b: await tx.person.findFirstOrThrow({ where: { id: ids.raviP } }),
        roles: await tx.personRole.findMany({ where: { personId: ids.raviP } }),
        emp: await tx.employee.findFirstOrThrow({ where: { id: ids.ravi } }),
      }));
      expect(after.a).toMatchObject({ status: 'merged', mergedInto: ids.raviP });
      expect(after.b).toMatchObject({ givenName: 'raviU desk', primaryEmail: email('raviU') });
      expect(after.roles.map((r) => r.roleType).sort()).toEqual(['employee', 'login']);
      expect(after.emp.userId).toBe(users.raviU);
      expect((await api('hrA', 'get', '/people/same-person').expect(200)).body.rows).toEqual([]);
      const merged = (await api('hrA', 'get', `/people/persons/${ids.raviLoose}/merge`).expect(200)).body;
      expect(merged).toMatchObject({ name: 'raviU desk', intoName: 'raviU desk', note: 'Same work email; confirmed by phone', moved: ['Login'], employeeLinked: true });

      await api('hrA', 'post', `/people/persons/${ids.raviLoose}/unmerge`).send({ note: '' }).expect(400);
      await api('hrA', 'post', `/people/persons/${ids.raviLoose}/unmerge`).send({ note: 'Different people after all' }).expect(201);
      await api('hrA', 'post', `/people/persons/${ids.raviLoose}/unmerge`).send({ note: 'Again' }).expect(404);
      const back = await tenantPrisma.forTenant(SUPER, async (tx) => ({
        a: await tx.person.findFirstOrThrow({ where: { id: ids.raviLoose } }),
        b: await tx.person.findFirstOrThrow({ where: { id: ids.raviP } }),
        login: await tx.personRole.findFirstOrThrow({ where: { personId: ids.raviLoose } }),
        emp: await tx.employee.findFirstOrThrow({ where: { id: ids.ravi } }),
        log: await tx.personLinkLog.findMany({ where: { organizationId: org.A.id, personId: ids.raviLoose }, orderBy: { createdAt: 'asc' } }),
      }));
      expect(back.a).toMatchObject({ status: 'active', mergedInto: null });
      expect(back.b).toMatchObject({ givenName: 'Ravi', primaryEmail: email('raviU') });
      expect(back.login.roleType).toBe('login');
      expect(back.emp.userId).toBeNull();
      expect(back.log.map((l) => l.action)).toEqual(['merge', 'unmerge']);
    });
  });

  // ------------------------------------------------------------------------------------------ BFSI declarations (PPL-43)

  describe('BFSI declarations (PPL-43)', () => {
    it('the compliance officer designates people they reach; nobody else may', async () => {
      await api('hrA', 'post', `/people/bfsi/designations/${ids.arjun}`).expect(403);
      await api('arjunU', 'get', '/people/bfsi/register').expect(403);
      await api('hrTn', 'post', `/people/bfsi/designations/${ids.arjun}`).expect(404); // outside the plant
      expect((await api('arjunU', 'get', '/people/me/bfsi').expect(200)).body).toEqual({ designated: false });
      await api('arjunU', 'post', '/people/me/bfsi/holdings').send({ security: 'X', quantity: 1 }).expect(403);
      // hrPlain holds the officer profile company-wide (granted in PPL-38's test).
      expect((await api('hrPlain', 'get', '/people/bfsi/candidates').expect(200)).body.map((p: { employeeId: string }) => p.employeeId)).toContain(ids.arjun);
      await api('hrPlain', 'post', `/people/bfsi/designations/${ids.arjun}`).expect(201);
      const reg = (await api('hrPlain', 'get', '/people/bfsi/register').expect(200)).body;
      expect(reg.rows).toEqual([expect.objectContaining({ employeeId: ids.arjun, name: 'Arjun', status: expect.stringMatching(/Pending|Overdue/) })]);
      expect((await api('hrTn', 'get', '/people/bfsi/register').expect(200)).body.rows).toEqual([]);
    });

    it('the person declares holdings, related persons and conflicts; values are sealed; submitting needs step-up and an answer', async () => {
      const holding = (await api('arjunU', 'post', '/people/me/bfsi/holdings').send({ security: 'Deccan Agro Industries Ltd', quantity: 350, how: 'Demat · NSDL' }).expect(201)).body.id;
      await api('arjunU', 'post', '/people/me/bfsi/holdings').send({ security: 'Y', quantity: 0 }).expect(400);
      await api('arjunU', 'post', '/people/me/bfsi/related').send({ name: 'Shalini', relation: 'Spouse', pan: 'BRGPR7712' }).expect(400);
      await api('arjunU', 'post', '/people/me/bfsi/related').send({ name: 'Shalini', relation: 'Cousin' }).expect(400);
      await api('arjunU', 'post', '/people/me/bfsi/related').send({ name: 'Shalini', relation: 'Spouse', pan: 'BRGPR7712K' }).expect(201);
      const extra = (await api('arjunU', 'post', '/people/me/bfsi/holdings').send({ security: 'Mistake Ltd', quantity: 1 }).expect(201)).body.id;
      await api('arjunU', 'delete', `/people/me/bfsi/holdings/${extra}`).expect(200);
      await api('arjunU', 'put', '/people/me/bfsi/coi').send({ answer: 'yes' }).expect(400);
      await up('arjunU');
      await api('arjunU', 'post', '/people/me/bfsi/submit').expect(400); // the conflict question first
      await api('arjunU', 'put', '/people/me/bfsi/coi').send({ answer: 'yes', details: 'My brother supplies packaging' }).expect(200);
      const mine = (await api('arjunU', 'get', '/people/me/bfsi').expect(200)).body;
      expect(mine).toMatchObject({ designated: true, status: 'draft', holdings: [{ id: holding, security: 'Deccan Agro Industries Ltd', quantity: 350, how: 'Demat · NSDL' }], related: [{ name: 'Shalini', relation: 'Spouse', pan: '•••• 712K' }], coi: { answer: 'yes', details: 'My brother supplies packaging' } });
      const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.bfsiDeclaration.findFirstOrThrow({ where: { organizationId: org.A.id } }));
      expect(`${row.holdingsEnc}${row.relatedEnc}${row.coiEnc}`).not.toMatch(/Deccan|BRGPR|brother/);
      // The officer cannot read a draft.
      await api('hrPlain', 'get', `/people/bfsi/declarations/${ids.arjun}`).expect(404);
      await api('arjunU', 'post', '/people/me/bfsi/submit').expect(201);
      await api('arjunU', 'post', '/people/me/bfsi/holdings').send({ security: 'Late Ltd', quantity: 1 }).expect(409);
    });

    it('the officer reviews (a recorded look), cannot remind a submitted person, and exports statuses only', async () => {
      const review = (await api('hrPlain', 'get', `/people/bfsi/declarations/${ids.arjun}`).expect(200)).body;
      expect(review.holdings).toHaveLength(1);
      expect((await audits('compliance.declaration.viewed')).map((a) => a.entityId)).toEqual([ids.arjun]);
      const log = (await api('arjunU', 'get', '/people/me/access-log').expect(200)).body.entries;
      expect(log).toEqual(expect.arrayContaining([expect.objectContaining({ what: 'Annual declaration (holdings and related persons)', context: 'Compliance review' })]));
      await api('hrPlain', 'post', `/people/bfsi/declarations/${ids.arjun}/remind`).expect(409);
      const csv = (await api('hrPlain', 'get', '/people/bfsi/register.csv').expect(200)).text;
      expect(csv).toContain('Arjun,Holdings and relatives (annual)');
      expect(csv).toContain(',Done,');
      expect(csv).not.toContain('Deccan');
      expect((await api('hrPlain', 'get', '/people/bfsi/register').expect(200)).body.rows[0].status).toBe('Done');
    });

    it('a pending person is reminded; undesignating removes them from the register', async () => {
      await api('hrPlain', 'post', `/people/bfsi/designations/${ids.imran}`).expect(201);
      await api('hrPlain', 'post', `/people/bfsi/declarations/${ids.imran}/remind`).expect(201);
      expect((await audits('compliance.declaration.reminded')).map((a) => a.entityId)).toEqual([ids.imran]);
      await api('hrPlain', 'delete', `/people/bfsi/designations/${ids.imran}`).expect(200);
      await api('hrPlain', 'delete', `/people/bfsi/designations/${ids.imran}`).expect(404);
      expect((await api('hrPlain', 'get', '/people/bfsi/register').expect(200)).body.rows.map((r: { employeeId: string }) => r.employeeId)).toEqual([ids.arjun]);
    });
  });

  // ------------------------------------------------------------------------------------------ pre-clearance (PPL-44)

  describe('trading pre-clearance (PPL-44)', () => {
    const ask = { security: 'Deccan Agro Industries Ltd', side: 'sell', quantity: 350, value: 1225000, noUpsi: true };

    it('only designated persons ask; the request is validated', async () => {
      await api('hrA', 'get', '/people/me/pre-clearance').expect(404); // no employee record
      await api('arjunU', 'post', '/people/me/pre-clearance').send({ ...ask, noUpsi: false }).expect(400);
      await api('arjunU', 'post', '/people/me/pre-clearance').send({ ...ask, side: 'short' }).expect(400);
      await api('arjunU', 'post', '/people/me/pre-clearance').send({ ...ask, quantity: 0 }).expect(400);
      const r = (await api('arjunU', 'post', '/people/me/pre-clearance').send(ask).expect(201)).body;
      expect(r.referenceNo).toMatch(/^PC-\d{4}-0001$/);
      ids.pc1 = r.id;
      const mine = (await api('arjunU', 'get', '/people/me/pre-clearance').expect(200)).body;
      expect(mine.rules).toEqual({ threshold: 1000000, validDays: 7, decideDays: 2 });
      expect(mine.requests[0]).toMatchObject({ referenceNo: r.referenceNo, status: 'Pending', value: '1225000' });
    });

    it('the officer in scope decides (a reason to reject); approval is valid for the trading days', async () => {
      await api('hrA', 'get', '/people/pre-clearance').expect(403);
      expect((await api('hrTn', 'get', '/people/pre-clearance').expect(200)).body.rows).toEqual([]);
      await api('hrTn', 'post', `/people/pre-clearance/${ids.pc1}/decision`).send({ decision: 'approve' }).expect(404);
      await api('hrPlain', 'post', `/people/pre-clearance/${ids.pc1}/decision`).send({ decision: 'reject' }).expect(400);
      await api('hrPlain', 'post', `/people/pre-clearance/${ids.pc1}/decision`).send({ decision: 'approve' }).expect(201);
      await api('hrPlain', 'post', `/people/pre-clearance/${ids.pc1}/decision`).send({ decision: 'approve' }).expect(409);
      const row = (await api('hrPlain', 'get', '/people/pre-clearance').expect(200)).body.rows[0];
      expect(row).toMatchObject({ status: 'Approved', validUntil: tradingDaysFrom(todayIst(), 7), name: 'Arjun' });
      const told = await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, recipientUserId: users.arjunU, type: 'workflow.approval.decided' } }));
      expect(told).toHaveLength(1);
    });

    it('the trade is reported once, within the window, with the person\u2019s own contract note', async () => {
      const note = await tenantPrisma.forTenant(ctx('A'), async (tx) => {
        const personId = (await tx.employee.findFirstOrThrow({ where: { id: ids.arjun } })).personId!;
        return (await tx.document.create({ data: { organizationId: org.A.id, personId, typeKey: 'contract_note', status: 'uploaded' } })).id;
      });
      const pan = await tenantPrisma.forTenant(ctx('A'), async (tx) => (await tx.document.findFirstOrThrow({ where: { organizationId: org.A.id, typeKey: 'disability_certificate' } })).id);
      const path = `/people/me/pre-clearance/${ids.pc1}/report`;
      await api('arjunU', 'post', path).send({ tradedOn: addDays(todayIst(), 1), quantity: 350, contractNoteDocumentId: note }).expect(400); // the future
      await api('arjunU', 'post', path).send({ tradedOn: todayIst(), quantity: 351, contractNoteDocumentId: note }).expect(400);
      await api('arjunU', 'post', path).send({ tradedOn: todayIst(), quantity: 350, contractNoteDocumentId: pan }).expect(400);
      await api('arjunU', 'post', path).send({ tradedOn: todayIst(), quantity: 300, contractNoteDocumentId: note }).expect(201);
      await api('arjunU', 'post', path).send({ tradedOn: todayIst(), quantity: 300, contractNoteDocumentId: note }).expect(409);
      expect((await api('arjunU', 'get', '/people/me/pre-clearance').expect(200)).body.requests[0]).toMatchObject({ status: 'Done', tradedOn: todayIst(), tradedQuantity: 300 });
    });

    it('the officer never decides their own request', async () => {
      // hrPlain becomes a designated employee with their own login.
      const own = await hire('KF', 'Officer', 'KF0400', { workEmail: email('hrPlain'), userId: users.hrPlain });
      await api('hrPlain', 'post', `/people/bfsi/designations/${own}`).expect(201);
      const r = (await api('hrPlain', 'post', '/people/me/pre-clearance').send(ask).expect(201)).body;
      await api('hrPlain', 'post', `/people/pre-clearance/${r.id}/decision`).send({ decision: 'approve' }).expect(403);
    });
  });
});
