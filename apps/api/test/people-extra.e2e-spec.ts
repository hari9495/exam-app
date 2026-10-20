import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { OtpService } from '../src/auth/otp.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';

// People, the rest of the designed screens, against the real database (forced RLS): identity checks (PPL-34), merge and
// unmerge (PPL-37), the disability declaration (PPL-38), work authorisations (PPL-45), international bank details with
// split pay (PPL-46), and BFSI declarations (PPL-43) and trading pre-clearance (PPL-44) for a company that switches them
// on. Each with its key, another company, maker-checker where there is an approval, and the audit.
describe('People: identity, merge, disability, work authorisations, international bank, BFSI (PPL-34, 37, 38, 43, 44, 45, 46)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const joined = addDays(today, -400);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 10 10]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'approverA' | 'diversityA' | 'officerA' | 'arjunU' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@extra.test`;
  const asSuper = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  const audits = (action: string) => asSuper((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action } }));
  const codes: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    // The attestation code is read here instead of from a phone.
    const otp = app.get(OtpService);
    const issue = otp.issue.bind(otp);
    jest.spyOn(otp, 'issue').mockImplementation(async (key, data) => {
      const code = await issue(key, data);
      codes.push(code);
      return code;
    });
    jest.spyOn(otp, 'deliver').mockImplementation(() => undefined);

    planId = (await prisma.plan.create({ data: { name: `extra-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `extra-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.le = (await tx.legalEntity.create({ data: { ...o, name: 'Entity KF', shortName: 'KF', isDefault: true, employeeCodePrefix: 'KF' } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.le, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const id = randomUUID();
      await tx.department.create({ data: { ...o, id, name: 'Quality', code: 'Q', path: `/${id}/` } });
      ids.dept = id;
      ids.des = (await tx.designation.create({ data: { ...o, name: 'Quality Lead', code: 'QL' } })).id;
      ids.type = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'P', category: 'permanent' } })).id;
    });
    await tenantPrisma.forTenant(ctx('B'), (tx) => tx.legalEntity.create({ data: { organizationId: org.B.id, name: 'Entity BB', shortName: 'BB', isDefault: true, employeeCodePrefix: 'BB' } }));

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hr = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'employee.identity.view', 'employee.identity.manage'], 'HR');
    const approver = await profile(['employee.profile.view', 'employee.identity.view', 'employee.identity.approve'], 'Bank approver');
    const diversity = await profile(['employee.disability.manage'], 'HR diversity');
    const officer = await profile(['compliance.officer'], 'Compliance officer');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hrA', 'A', 'panel', hr],
      ['approverA', 'A', 'panel', approver],
      ['diversityA', 'A', 'panel', diversity],
      ['officerA', 'A', 'panel', officer],
      ['arjunU', 'A', 'panel', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[name]);
    }
    const hire = async (givenName: string, code: string, login?: Who) =>
      (
        await api('hrA', 'post', '/people/employees')
          .send({ legalEntityId: ids.le, employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, ...(login ? { userId: users[login], workEmail: email(login) } : {}), assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.des, employmentTypeId: ids.type, managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
    ids.arjun = await hire('Arjun', 'KF0142', 'arjunU');
    ids.imran = await hire('Imran', 'KF0007', 'officerA');
    ids.divya = await hire('Divya', 'KF0001');
    ids.arjunPerson = (await asSuper((tx) => tx.employee.findFirstOrThrow({ where: { id: ids.arjun } }))).personId;
  }, 240_000);

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

  // ------------------------------------------------------------------------------------------ PPL-34 identity

  it('identity: HR records checks with consent; every view is audited; other keys and companies see nothing', async () => {
    await api('arjunU', 'get', `/people/employees/${ids.arjun}/identity`).expect(403);
    await api('adminB', 'get', `/people/employees/${ids.arjun}/identity`).expect(403);
    await api('hrA', 'post', `/people/employees/${ids.arjun}/identity/checks`).send({ point: 'Day-1 identity check', result: 'mismatch' }).expect(400);
    await api('hrA', 'post', `/people/employees/${ids.arjun}/identity/checks`).send({ point: 'Day-1 identity check', result: 'mismatch', note: 'Photo on the ID is 15 years old', jurisdiction: 'India (DPDP)', consent: 'given' }).expect(201);
    await api('hrA', 'post', `/people/employees/${ids.arjun}/identity/checks`).send({ point: 'Attestation against the original passport', result: 'attested' }).expect(201);
    await api('approverA', 'post', `/people/employees/${ids.arjun}/identity/checks`).send({ point: 'x x x', result: 'attested' }).expect(403);
    const out = (await api('hrA', 'get', `/people/employees/${ids.arjun}/identity`).expect(200)).body;
    expect(out.consent).toEqual([{ jurisdiction: 'India (DPDP)', status: 'Given', point: 'Day-1 identity check', on: today }]);
    expect(out.checks.map((c: { result: string }) => c.result)).toEqual(['Mismatch: HR review', 'Attested against the original ID']);
    expect(await audits('employee.identity.viewed')).toHaveLength(1);
    expect(await audits('employee.identity.checked')).toHaveLength(2);
  });

  // ------------------------------------------------------------------------------------------ PPL-45 work authorisations

  it('work authorisations: HR adds with the number sealed; the person sees their own; occupation and expiry flagged', async () => {
    const visa = { country: 'AE', type: 'Employment visa', number: '784-1987-7731', sponsor: 'Kaveri Foods FZE', occupation: 'Quality Inspector', issuedOn: addDays(today, -300), expiresOn: addDays(today, 11) };
    await api('arjunU', 'post', `/people/employees/${ids.arjun}/work-auth`).send(visa).expect(403);
    await api('adminB', 'post', `/people/employees/${ids.arjun}/work-auth`).send(visa).expect(403);
    await api('adminB', 'get', `/people/employees/${ids.arjun}/work-auth`).expect(404);
    await api('hrA', 'post', `/people/employees/${ids.arjun}/work-auth`).send({ ...visa, type: 'Tourist visa' }).expect(400);
    await api('hrA', 'post', `/people/employees/${ids.arjun}/work-auth`).send(visa).expect(201);
    const row = await asSuper((tx) => tx.workAuthorisation.findFirstOrThrow({ where: { employeeId: ids.arjun } }));
    expect(row.numberEnc).not.toContain('7731');
    const mine = (await api('arjunU', 'get', `/people/employees/${ids.arjun}/work-auth`).expect(200)).body;
    expect(mine.rows).toMatchObject([{ type: 'Employment visa', number: 'XXXX7731', occupationDiffers: true, daysLeft: 11, status: 'Expiring' }]);
    expect(mine.canAdd).toBe(false);
    await api('arjunU', 'get', `/people/employees/${ids.divya}/work-auth`).expect(404);
    expect((await api('hrA', 'get', `/people/employees/${ids.arjun}/work-auth`).expect(200)).body.canAdd).toBe(true);
    expect(await audits('employee.work_auth.added')).toHaveLength(1);
  });

  // ------------------------------------------------------------------------------------------ PPL-46 international bank

  it('international bank: IBAN and split checked at the server; one approval by someone else; the old split ends', async () => {
    const accounts = [
      { kind: 'iban', iban: 'AE07 0331 2345 6789 0123 456', bic: 'ECBKAEAD', bankName: 'Emirates Crescent Bank', rule: 'remainder', value: 0 },
      { kind: 'iban', iban: 'AE73 0260 0010 1523 4567 801', bic: 'GSBKAEAD', rule: 'percent', value: 10 },
    ];
    const body = { country: 'AE', currency: 'AED', accounts };
    await api('hrA', 'post', `/people/employees/${ids.arjun}/intl-bank`).send({ ...body, accounts: [{ ...accounts[0], iban: 'AE07 0331 2345 6789 0123 457' }] }).expect(400);
    await api('hrA', 'post', `/people/employees/${ids.arjun}/intl-bank`).send({ ...body, accounts: [accounts[0], { ...accounts[1], value: 120 }] }).expect(400);
    await api('adminB', 'post', `/people/employees/${ids.arjun}/intl-bank`).send(body).expect(404);
    // The person raises their own change.
    const { id } = (await api('arjunU', 'post', `/people/employees/${ids.arjun}/intl-bank`).send(body).expect(201)).body;
    await api('hrA', 'post', `/people/employees/${ids.arjun}/intl-bank`).send(body).expect(409);
    const seen = (await api('approverA', 'get', `/people/employees/${ids.arjun}/intl-bank`).expect(200)).body;
    expect(seen.pending.accounts.map((a: { label: string }) => a.label)).toEqual(['Emirates Crescent Bank · AE•• •••• 3456', 'AE•• •••• 7801']);
    expect(seen.canDecide).toBe(true);
    expect(JSON.stringify(await asSuper((tx) => tx.paySplitRequest.findFirstOrThrow({ where: { id } })))).not.toContain('0331');
    await api('hrA', 'post', `/people/employees/${ids.arjun}/intl-bank/${id}/decide`).send({ approve: true, version: 1 }).expect(403);
    await api('approverA', 'post', `/people/employees/${ids.arjun}/intl-bank/${id}/decide`).send({ approve: false, version: 1 }).expect(400);
    await api('approverA', 'post', `/people/employees/${ids.arjun}/intl-bank/${id}/decide`).send({ approve: true, version: 1 }).expect(200);
    const now = (await api('arjunU', 'get', `/people/employees/${ids.arjun}/intl-bank`).expect(200)).body;
    expect(now.current.accounts).toHaveLength(2);
    // A second change replaces it after approval; the first stops (kept, with its end).
    const second = (await api('hrA', 'post', `/people/employees/${ids.arjun}/intl-bank`).send({ ...body, accounts: [accounts[0]] }).expect(201)).body.id;
    await api('approverA', 'post', `/people/employees/${ids.arjun}/intl-bank/${second}/decide`).send({ approve: true, version: 1 }).expect(200);
    const all = await asSuper((tx) => tx.paySplitRequest.findMany({ where: { employeeId: ids.arjun }, orderBy: { requestedAt: 'asc' } }));
    expect(all.map((r) => [r.status, r.validTo !== null])).toEqual([['approved', true], ['approved', false]]);
    expect(all[1].usableFrom!.getTime()).toBeGreaterThan(Date.now() + 3_600_000);
    expect((await audits('employee.bank_split.approved')).length).toBe(2);
  });

  // ------------------------------------------------------------------------------------------ PPL-38 disability

  it('disability: declared by the person with consent and a certificate; the diversity role verifies, never its own; withdrawal hides it', async () => {
    const me = (await api('arjunU', 'get', '/people/me/disability').expect(200)).body;
    expect(me.declaration).toBeNull();
    const doc = (await api('arjunU', 'post', `/documents/people/${me.personId}/disability_certificate`).attach('file', PNG, 'udid.png').expect(201)).body;
    const declare = { consent: true, category: 'Locomotor disability', percent: 45, certificateDocumentId: doc.id, validUntil: addDays(today, 1600), adjustments: 'Ground-floor workstation near the lift' };
    await api('arjunU', 'post', '/people/me/disability').send({ ...declare, consent: false }).expect(400);
    await api('arjunU', 'post', '/people/me/disability').send({ ...declare, category: 'Tired' }).expect(400);
    await api('arjunU', 'post', '/people/me/disability').send(declare).expect(201);
    await api('arjunU', 'post', '/people/me/disability').send(declare).expect(409);
    // HR without the diversity key, and another company, see nothing.
    await api('hrA', 'get', '/people/disability').expect(403);
    await api('adminB', 'get', '/people/disability').expect(403);
    const list = (await api('diversityA', 'get', '/people/disability').expect(200)).body;
    expect(list).toMatchObject([{ name: 'Arjun', category: 'Locomotor disability', percent: 45, shown: 'Needs review', canVerify: true }]);
    await api('diversityA', 'post', `/people/disability/${list[0].id}/verify`).send({ version: 1 }).expect(200);
    expect((await api('arjunU', 'get', '/people/me/disability').expect(200)).body.declaration.status).toBe('verified');
    await api('arjunU', 'post', '/people/me/disability/withdraw').expect(200);
    expect((await api('diversityA', 'get', '/people/disability').expect(200)).body).toEqual([]);
    expect((await audits('employee.disability.declared')).length + (await audits('employee.disability.verified')).length + (await audits('employee.disability.withdrawn')).length).toBe(3);
    expect(await audits('employee.disability.list_viewed')).toHaveLength(2);
  });

  // ------------------------------------------------------------------------------------------ PPL-37 merge and unmerge

  it('merge and unmerge: field by field, every row moves and comes back, nothing lost; company-wide HR only', async () => {
    // A second record of Arjun (made at a career-fair registration) with its own consent and identity check.
    const other = await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Arjun', familyName: 'Kulkarni', primaryEmail: `arjun.k-${runId}@mail.test`, primaryPhone: '+919845011223' } });
      await tx.consentRecord.create({ data: { organizationId: org.A.id, personId: p.id, purpose: 'bgv', noticeVersion: 'v1', itemsShown: [], evidence: {} } });
      await tx.identityCheck.create({ data: { organizationId: org.A.id, personId: p.id, point: 'Application verification', result: 'captured', checkedOn: new Date(`${addDays(today, -500)}T00:00:00Z`) } });
      return p.id;
    });
    const merge = { keepPersonId: ids.arjunPerson, mergePersonId: other, picks: { name: 'b', email: 'b', phone: 'b' }, note: 'Same person: same phone and date of birth, confirmed by call' };
    await api('approverA', 'post', '/people/merges').send(merge).expect(403);
    await api('adminB', 'get', `/people/merges/compare?keep=${ids.arjunPerson}&merge=${other}`).expect(404);
    const cmp = (await api('hrA', 'get', `/people/merges/compare?keep=${ids.arjunPerson}&merge=${other}`).expect(200)).body;
    expect(cmp).toMatchObject({ a: { name: 'Arjun', employee: { code: 'KF0142' } }, b: { name: 'Arjun Kulkarni', phone: '+919845011223', employee: null }, blocked: null });
    await api('hrA', 'post', '/people/merges').send({ ...merge, note: 'x' }).expect(400);
    const { id } = (await api('hrA', 'post', '/people/merges').send(merge).expect(201)).body;
    const kept = await asSuper((tx) => tx.person.findUniqueOrThrow({ where: { id: ids.arjunPerson } }));
    expect(kept).toMatchObject({ givenName: 'Arjun', familyName: 'Kulkarni', primaryPhone: '+919845011223' });
    // A consent is evidence kept as given: it stays on the merged record (which points to the kept one); the check moves.
    expect(await asSuper((tx) => tx.consentRecord.count({ where: { personId: other } }))).toBe(1);
    expect(await asSuper((tx) => tx.identityCheck.count({ where: { personId: ids.arjunPerson } }))).toBe(3);
    expect(await asSuper((tx) => tx.person.findUniqueOrThrow({ where: { id: other } }))).toMatchObject({ status: 'merged', mergedInto: ids.arjunPerson });
    // Two employee records are two people: refused.
    const divyaPerson = (await asSuper((tx) => tx.employee.findFirstOrThrow({ where: { id: ids.divya } }))).personId;
    await api('hrA', 'post', '/people/merges').send({ ...merge, mergePersonId: divyaPerson }).expect(409);
    // Unmerge: every row back, the fields the merge took back, the record active again.
    await api('hrA', 'post', `/people/merges/${id}/unmerge`).send({ note: 'Merged by mistake: different person' }).expect(200);
    await api('hrA', 'post', `/people/merges/${id}/unmerge`).send({ note: 'Merged by mistake: different person' }).expect(409);
    expect(await asSuper((tx) => tx.person.findUniqueOrThrow({ where: { id: ids.arjunPerson } }))).toMatchObject({ givenName: 'Arjun', familyName: null, primaryPhone: null });
    expect(await asSuper((tx) => tx.person.findUniqueOrThrow({ where: { id: other } }))).toMatchObject({ status: 'active', mergedInto: null, primaryEmail: `arjun.k-${runId}@mail.test` });
    expect(await asSuper((tx) => tx.consentRecord.count({ where: { personId: other } }))).toBe(1);
    expect(await asSuper((tx) => tx.identityCheck.count({ where: { personId: other } }))).toBe(1);
    expect(await asSuper((tx) => tx.identityCheck.count({ where: { personId: ids.arjunPerson } }))).toBe(2);
    expect((await asSuper((tx) => tx.personLinkLog.findMany({ where: { organizationId: org.A.id }, orderBy: { createdAt: 'asc' } }))).map((l) => l.action).slice(-2)).toEqual(['merge', 'unmerge']);
    expect((await audits('person.merged')).length + (await audits('person.unmerged')).length).toBe(2);
  });

  // ------------------------------------------------------------------------------------------ PPL-43 / 44 BFSI

  it('BFSI: off unless the company switches it on; designated persons declare and attest with a code; the officer reviews', async () => {
    expect((await api('arjunU', 'get', '/compliance/me').expect(200)).body).toEqual({ enabled: false });
    await api('officerA', 'get', '/compliance/register').expect(404);
    await asSuper((tx) => tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key: 'people.bfsi_compliance', value: 'on' } }));
    expect((await api('arjunU', 'get', '/compliance/me').expect(200)).body).toEqual({ enabled: true, designated: false });
    await api('hrA', 'get', '/compliance/register').expect(403);
    await api('adminB', 'post', '/compliance/designated').send({ employeeId: ids.arjun }).expect(403);
    expect((await api('adminB', 'get', '/compliance/me').expect(200)).body).toEqual({ enabled: false });
    await api('officerA', 'post', '/compliance/designated').send({ employeeId: ids.arjun }).expect(201);
    await api('officerA', 'post', '/compliance/designated').send({ employeeId: ids.imran }).expect(201);
    const me = (await api('arjunU', 'get', '/compliance/me').expect(200)).body;
    expect(me.declaration).toMatchObject({ status: 'draft', holdings: [], version: 1 });
    await api('arjunU', 'put', '/compliance/me/declaration').send({ holdings: [], related: [{ name: 'Shalini', relation: 'Spouse', pan: 'BAD' }], coiHas: false, version: 1 }).expect(400);
    const saved = (await api('arjunU', 'put', '/compliance/me/declaration').send({ holdings: [{ security: 'Deccan Agro Industries Ltd', quantity: 350, how: 'Demat · NSDL' }], related: [{ name: 'Shalini Kulkarni', relation: 'Spouse', pan: 'ABCPK4411K' }], coiHas: true, coiDetails: 'My brother is a partner in a packaging vendor.', version: 1 }).expect(200)).body;
    expect(saved.related).toEqual([{ name: 'Shalini Kulkarni', relation: 'Spouse', pan: 'XXXXXX411K', holdings: null }]);
    await api('arjunU', 'post', '/compliance/me/declaration/otp').expect(200);
    await api('arjunU', 'post', '/compliance/me/declaration/submit').send({ code: '000000', attest: true }).expect(400);
    await api('arjunU', 'post', '/compliance/me/declaration/submit').send({ code: codes.at(-1), attest: true }).expect(200);
    await api('arjunU', 'put', '/compliance/me/declaration').send({ holdings: [], related: [], coiHas: false, version: 3 }).expect(409);
    const reg = (await api('officerA', 'get', '/compliance/register').expect(200)).body;
    expect(reg.rows.map((r: { name: string; status: string }) => [r.name, r.status])).toEqual([['Arjun', 'Done'], ['Imran', 'Pending']]);
    const arjunRow = reg.rows.find((r: { name: string }) => r.name === 'Arjun');
    // The officer never reviews their own declaration (Imran is the officer).
    await api('officerA', 'post', `/compliance/declarations/${reg.rows.find((r: { name: string }) => r.name === 'Imran').declarationId}/review`).send({ version: 1 }).expect(403);
    await api('officerA', 'post', `/compliance/declarations/${arjunRow.declarationId}/review`).send({ version: arjunRow.version }).expect(200);
    expect(await audits('compliance.declaration.submitted')).toHaveLength(1);
    expect(await audits('compliance.declaration.reviewed')).toHaveLength(1);
  });

  it('pre-clearance: never in a closed window; the officer approves (never their own) for 7 trading days; the trade is reported with its contract note', async () => {
    const req = { security: 'Deccan Agro Industries Ltd', side: 'sell', quantity: 350, value: 1225000, noUpsi: true };
    await api('arjunU', 'post', '/compliance/me/preclearance').send({ ...req, noUpsi: false }).expect(400);
    await api('officerA', 'post', '/compliance/trading-windows').send({ from: addDays(today, -1), to: addDays(today, 1), reason: 'Quarterly results' }).expect(201);
    expect((await api('arjunU', 'post', '/compliance/me/preclearance').send(req).expect(409)).body.message).toBe(`The trading window is closed until ${addDays(today, 1)}. Request again when it reopens.`);
    await asSuper((tx) => tx.tradingWindow.updateMany({ where: { organizationId: org.A.id }, data: { closedTo: new Date(`${addDays(today, -1)}T00:00:00Z`) } }));
    const { id, ref } = (await api('arjunU', 'post', '/compliance/me/preclearance').send(req).expect(201)).body;
    expect(ref).toMatch(/^PC-\d{4}-0001$/);
    const own = (await api('officerA', 'post', '/compliance/me/preclearance').send({ ...req, security: 'Nilgiri Logistics Ltd' }).expect(201)).body.id;
    await api('officerA', 'post', `/compliance/preclearance/${own}/decide`).send({ approve: true, version: 1 }).expect(403);
    await api('hrA', 'post', `/compliance/preclearance/${id}/decide`).send({ approve: true, version: 1 }).expect(403);
    const ok = (await api('officerA', 'post', `/compliance/preclearance/${id}/decide`).send({ approve: true, version: 1 }).expect(200)).body;
    expect(ok.validUntil > today).toBe(true);
    const queue = (await api('officerA', 'get', '/compliance/preclearance').expect(200)).body;
    expect(queue.find((r: { id: string }) => r.id === id)).toMatchObject({ name: 'Arjun', status: 'Approved', value: 1225000 });
    const person = (await api('arjunU', 'get', '/people/me/disability').expect(200)).body.personId;
    const note = (await api('arjunU', 'post', `/documents/people/${person}/contract_note`).attach('file', PDF, 'note.pdf').expect(201)).body;
    await api('arjunU', 'post', `/compliance/me/preclearance/${id}/report`).send({ tradedOn: today, quantity: 400, contractNoteDocumentId: note.id, version: 2 }).expect(400);
    expect((await api('arjunU', 'post', `/compliance/me/preclearance/${id}/report`).send({ tradedOn: today, quantity: 350, contractNoteDocumentId: note.id, version: 2 }).expect(200)).body).toEqual({ reported: true, late: false });
    expect((await api('arjunU', 'get', '/compliance/me').expect(200)).body.requests.find((r: { id: string }) => r.id === id).status).toBe('Done');
    expect((await audits('compliance.preclearance.approved')).length + (await audits('compliance.preclearance.reported')).length).toBe(2);
  });
});
