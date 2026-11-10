import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { verhoeffValid } from '../src/service-desk/pii';
import { ContractLabourService } from '../src/contract-labour/contract-labour.service';

// Contract labour CL-3 (answers 631, 636, 678; T9-13): the contractor portal. Access per contact from the compliance
// owner; an email code that never says who has access; a hashed session that expires; only the contact's own
// contractor; add a worker through the CL-2 checks; upload a licence renewal that waits for verification; licence
// alerts emailed to the contacts. Another contractor's record 404; no, ended or expired session 401.

jest.setTimeout(300_000);

describe('Contract labour CL-3: contractor portal', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let clra: ContractLabourService;
  let redis: Redis;
  const send = jest.fn(async (_m: { to: string; subject: string; html: string }) => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'owner' | 'reader' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post', path: string, t?: string) => {
    const r = request(server())[method](`/api/v1/public/contractor-portal/${org.A.slug}${path}`);
    return t ? r.set('X-Contractor-Portal', t) : r;
  };
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const yearsAgo = (n: number) => `${Number(today.slice(0, 4)) - n}${today.slice(4)}`;
  const aadhaar = (n: number) => {
    const head = `3${String(n).padStart(10, '0')}`;
    for (let d = 0; d < 10; d++) if (verhoeffValid(head + d)) return head + d;
    throw new Error('no check digit');
  };
  const MEERA = `meera-${run}@vetri.test`;
  const RAVI = `ravi-${run}@kaveri.test`;
  /** The resend cooldown for an email (the OTP service's own key), cleared between this test's deliberate sign-ins. */
  const cool = (email: string) => redis.del(`auth:otp:cool:${createHash('sha256').update(`contractor-portal:${org.A.id}:${email}`).digest('hex')}`);
  const signIn = async (email: string) => {
    send.mockClear();
    await portal('post', '/code').send({ email }).expect(200);
    let code = '';
    for (let i = 0; i < 50 && !code; i++) {
      const m = send.mock.calls.find(([x]) => x.to === email);
      if (m) code = m[0].subject.slice(0, 6);
      else await new Promise((r) => setTimeout(r, 100));
    }
    return code;
  };
  const licence = async (contractorId: string, no: string, validTo: string, max = '5') => {
    const r = api('owner', 'post', `/contract-labour/contractors/${contractorId}/licences`);
    for (const [k, v] of Object.entries({ locationId: ids.hosur!, licenceNo: no, scope: 'Security', states: 'IN-TN', maxWorkers: max, validFrom: addDays(today, -300), validTo })) r.field(k, v);
    const id = (await r.attach('file', Buffer.from(`%PDF-1.7\n${no}\n%%EOF`), { filename: 'l.pdf', contentType: 'application/pdf' }).expect(want(201))).body.id as string;
    await inA(async (tx) => tx.file.updateMany({ where: { id: (await tx.contractorLicence.findFirstOrThrow({ where: { id } })).fileId, scanStatus: 'pending' }, data: { scanStatus: 'clean', scannedAt: new Date() } }));
    await api('owner', 'post', `/contract-labour/licences/${id}/verify`).expect(want(201));
    return id;
  };
  const worker = (p: Record<string, unknown> = {}) => ({ locationId: ids.hosur, givenName: 'Kannan', familyName: 'S', dob: yearsAgo(30), aadhaar: aadhaar(1), skill: 'unskilled', fromOn: today, ...p });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    clra = moduleRef.get(ContractLabourService);
    redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const keys = [...(await redis.keys('auth:otp:ip:*')), ...(await redis.keys('*contractor-portal*'))];
    if (keys.length) await redis.del(...keys);
    planId = (await prisma.plan.create({ data: { name: `clra3-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CLRA3 Org ${k}`, slug: `clra3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['owner', 'A', 'panel', ['clra.contractor.manage', 'clra.contractor.view']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@clra3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@clra3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.owner}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      ids.entity = (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Foods Pvt Ltd', shortName: `KF3-${run}`, isDefault: true } })).id;
      const loc = (name: string, code: string, state: string) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, name, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } });
      ids.hosur = (await loc('Hosur plant', `HSR${run}`, 'IN-TN')).id;
      ids.blr = (await loc('Bengaluru head office', `BLR${run}`, 'IN-KA')).id;
    });
    ids.vetri = (await api('owner', 'post', '/contract-labour/contractors').send({ name: `Vetri Security ${run}`, work: 'Security' }).expect(want(201))).body.id;
    ids.kaveri = (await api('owner', 'post', '/contract-labour/contractors').send({ name: `Kaveri Loaders ${run}`, work: 'Loading' }).expect(want(201))).body.id;
    ids.vLic = await licence(ids.vetri!, `TN/V/${run}`, addDays(today, 20));
    ids.kLic = await licence(ids.kaveri!, `TN/K/${run}`, addDays(today, 200));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          await tx.$executeRawUnsafe(`DELETE FROM "contract_deployments" WHERE organization_id = $1::uuid`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "contractor_licences" WHERE organization_id = $1::uuid AND renewal_of_id IS NOT NULL`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "contractor_licences" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('access per contact: the compliance owner invites (emailed the portal link); others refused', async () => {
    const body = { name: 'Meera Pillai', email: MEERA };
    await api('reader', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send(body).expect(403);
    await api('acting', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send(body).expect(403);
    await api('adminB', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send(body).expect(404);
    await api('owner', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send({ ...body, email: 'not-an-email' }).expect(400);
    send.mockClear();
    ids.meera = (await api('owner', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send(body).expect(want(201))).body.id;
    expect(send.mock.calls.some(([m]) => m.to === MEERA && m.html.includes(`/yx/contractor/${org.A.slug}`))).toBe(true);
    await api('owner', 'post', `/contract-labour/contractors/${ids.vetri}/contacts`).send(body).expect(409);
    ids.ravi = (await api('owner', 'post', `/contract-labour/contractors/${ids.kaveri}/contacts`).send({ name: 'Ravi K', email: RAVI }).expect(want(201))).body.id;
  });

  it('sign-in: a code only for a contact with access (same answer for anyone else); wrong code 401; a hashed session', async () => {
    expect(await Promise.race([signIn(`nobody-${run}@x.test`), new Promise<string>((r) => setTimeout(() => r(''), 2500))])).toBe('');
    const code = await signIn(MEERA);
    expect(code).toMatch(/^\d{6}$/);
    await portal('post', '/verify').send({ email: MEERA, code: code === '000000' ? '111111' : '000000' }).expect(401);
    const t = (await portal('post', '/verify').send({ email: MEERA, code }).expect(200)).body.token as string;
    ids.token = t;
    const s = await inA((tx) => tx.contractorPortalSession.findFirstOrThrow({ where: { contactId: ids.meera } }));
    expect(s.tokenHash).toHaveLength(64);
    expect(s.tokenHash).not.toBe(t);
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await portal('get', '/me').expect(401);
    await portal('get', '/me', 'not-a-token').expect(401);
    const c = (await api('reader', 'get', '/contract-labour/contractors').expect(200)).body.contractors.find((x: { id: string }) => x.id === ids.vetri);
    expect(c.contacts).toEqual([{ id: ids.meera, name: 'Meera Pillai', email: MEERA, portal: 'active' }]);
  });

  it('me: only the own contractor; the licence that ends soon is due', async () => {
    const me = (await portal('get', '/me', ids.token).expect(200)).body;
    expect(me.contractor.name).toBe(`Vetri Security ${run}`);
    expect(me.establishments).toEqual([expect.objectContaining({ licenceId: ids.vLic, licenceNo: `TN/V/${run}`, maxWorkers: 5, deployed: 0, renewal: null })]);
    expect(me.due).toEqual([expect.objectContaining({ kind: 'licence', tone: 'danger' })]);
    expect(me.sites).toEqual([{ id: ids.hosur, name: 'Hosur plant' }]);
    expect(JSON.stringify(me)).not.toContain(`Kaveri Loaders ${run}`);
    expect(JSON.stringify(me)).not.toContain(`TN/K/${run}`);
  });

  it('add a worker: the CL-2 checks, no override; the contractor is always the own one', async () => {
    const young = await portal('post', '/workers', ids.token).send(worker({ dob: yearsAgo(17) })).expect(400);
    expect(young.body).toMatchObject({ code: 'DEPLOYMENT_BLOCKED' });
    await portal('post', '/workers', ids.token).send(worker({ contractorId: ids.kaveri })).expect(400);
    const blr = (await portal('post', '/workers/check', ids.token).send(worker({ locationId: ids.blr })).expect(200)).body.checks;
    expect(blr.find((x: { id: string }) => x.id === 'licence')).toMatchObject({ status: 'fail' });
    await portal('post', '/workers', 'not-a-token').send(worker()).expect(401);
    const r = (await portal('post', '/workers', ids.token).send(worker()).expect(want(201))).body;
    const row = await inA((tx) => tx.contractDeployment.findFirstOrThrow({ where: { id: r.id } }));
    expect(row).toMatchObject({ agencyId: ids.vetri, status: 'pending', idLast4: aadhaar(1).slice(-4) });
    const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'clra.worker.sent', entityId: r.id } }));
    expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ via: 'contractor_portal', contactId: ids.meera });
    const me = (await portal('get', '/me', ids.token).expect(200)).body;
    expect(me.workers).toEqual([expect.objectContaining({ name: 'Kannan S', status: 'pending', gatePass: null, idMasked: `XXXX XXXX ${aadhaar(1).slice(-4)}` })]);
    expect(me.due.map((d: { kind: string }) => d.kind)).toContain('approval');
  });

  it('answer 736: the contractor withdraws its own waiting worker, with a reason; audited', async () => {
    const w = (await portal('get', '/me', ids.token).expect(200)).body.workers[0];
    await portal('post', `/workers/${w.id}/withdraw`, ids.token).send({ reason: 'x' }).expect(400);
    await portal('post', `/workers/${randomUUID()}/withdraw`, ids.token).send({ reason: 'Not joining' }).expect(404);
    await portal('post', `/workers/${w.id}/withdraw`, 'not-a-token').send({ reason: 'Not joining' }).expect(401);
    await portal('post', `/workers/${w.id}/withdraw`, ids.token).send({ reason: 'Not joining after all' }).expect(200);
    await portal('post', `/workers/${w.id}/withdraw`, ids.token).send({ reason: 'Not joining after all' }).expect(409);
    const row = await inA((tx) => tx.contractDeployment.findFirstOrThrow({ where: { id: w.id } }));
    expect(row).toMatchObject({ status: 'released', releaseReason: 'Not joining after all' });
    const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'clra.worker.released', entityId: w.id } }));
    expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ via: 'contractor_portal', contactId: ids.meera });
    expect((await portal('get', '/me', ids.token).expect(200)).body.workers).toEqual([]);
  });

  it("renewal: only of the own licence (another contractor's 404); it waits for verification", async () => {
    const f = { licenceNo: `TN/V2/${run}`, maxWorkers: '6', validFrom: addDays(today, 21), validTo: addDays(today, 385) };
    const up = (id: string, t: string = ids.token!) => {
      const r = portal('post', `/licences/${id}/renewal`, t);
      for (const [k, v] of Object.entries(f)) r.field(k, v);
      return r.attach('file', Buffer.from(`%PDF-1.7\n${run} renewal\n%%EOF`), { filename: 'renewal.pdf', contentType: 'application/pdf' });
    };
    await up(ids.kLic!).expect(404);
    await up(randomUUID()).expect(404);
    await up(ids.vLic!, 'not-a-token').expect(401);
    const r = (await up(ids.vLic!).expect(want(201))).body;
    expect(r.status).toBe('pending');
    await up(ids.vLic!).expect(409);
    const staff = (await api('reader', 'get', '/contract-labour/contractors').expect(200)).body.contractors.find((x: { id: string }) => x.id === ids.vetri);
    expect(staff.licences.find((l: { id: string }) => l.id === r.id)).toMatchObject({ status: 'pending', renewalOfId: ids.vLic });
    const me = (await portal('get', '/me', ids.token).expect(200)).body;
    expect(me.establishments[0].renewal).toMatchObject({ licenceNo: `TN/V2/${run}`, status: 'pending' });
    expect(me.due.map((d: { kind: string }) => d.kind)).toContain('renewal');
    ids.vRen = r.id;
  });

  it('answer 678: licence alerts are emailed to the contractor contacts too', async () => {
    await inA((tx) => tx.contractorLicence.update({ where: { id: ids.vLic }, data: { validTo: new Date(`${addDays(today, 30)}T00:00:00Z`) } }));
    send.mockClear();
    expect(await clra.alertOrg(org.A.id, today)).toBe(1);
    expect(send.mock.calls.some(([m]) => m.to === MEERA && m.subject === `Your licence TN/V/${run} ends in 30 days` && m.html.includes(`/yx/contractor/${org.A.slug}`))).toBe(true);
    expect(send.mock.calls.some(([m]) => m.to === RAVI)).toBe(false);
  });

  it('sessions end: expired 401, signed out 401, access removed 401', async () => {
    await inA((tx) => tx.contractorPortalSession.updateMany({ where: { contactId: ids.meera }, data: { expiresAt: new Date(Date.now() - 1000) } }));
    await portal('get', '/me', ids.token).expect(401);
    // Rate-limited: a second code at once is refused (429) until the cooldown passes.
    await cool(MEERA);
    await portal('post', '/code').send({ email: MEERA }).expect(200);
    await portal('post', '/code').send({ email: MEERA }).expect(429);
    await cool(MEERA);
    const t2 = (await portal('post', '/verify').send({ email: MEERA, code: await signIn(MEERA) }).expect(200)).body.token as string;
    await portal('post', '/sign-out', t2).expect(200);
    await portal('get', '/me', t2).expect(401);
    await cool(MEERA);
    const t3 = (await portal('post', '/verify').send({ email: MEERA, code: await signIn(MEERA) }).expect(200)).body.token as string;
    await api('reader', 'post', `/contract-labour/contractors/${ids.vetri}/contacts/${ids.meera}/remove`).expect(403);
    await api('owner', 'post', `/contract-labour/contractors/${ids.kaveri}/contacts/${ids.meera}/remove`).expect(404);
    await api('owner', 'post', `/contract-labour/contractors/${ids.vetri}/contacts/${ids.meera}/remove`).expect(want(201));
    await portal('get', '/me', t3).expect(401);
    await cool(MEERA);
    expect(await Promise.race([signIn(MEERA), new Promise<string>((r) => setTimeout(() => r(''), 2500))])).toBe('');
  });
});
