import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { verhoeffValid } from '../src/service-desk/pii';
import { monthsLater } from '../src/contract-labour/clra-rules';

// Contract labour CL-2 (answers 624, 632, 633, 635, 636, 674, 675): contract workers as persons with deployments, the
// server checks with no override, only the last 4 Aadhaar digits and a hash, site approval with the induction and the
// gate pass, release, work orders, the site cards and the directory. The compliance owner writes; readers read; others
// 403; acting for someone 403; another company 404.

jest.setTimeout(300_000);

describe('Contract labour CL-2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'owner' | 'reader' | 'hr' | 'other' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const yearsAgo = (n: number, days = 0) => addDays(`${Number(today.slice(0, 4)) - n}${today.slice(4)}`, days);
  /** A valid Aadhaar number: 11 digits and the Verhoeff check digit. */
  const aadhaar = (n: number) => {
    const head = `2${String(n).padStart(10, '0')}`;
    for (let d = 0; d < 10; d++) if (verhoeffValid(head + d)) return head + d;
    throw new Error('no check digit');
  };
  const worker = (p: Partial<Record<string, string | null>> = {}) => ({ contractorId: ids.vendor, locationId: ids.hosur, givenName: 'Kannan', familyName: 'S', dob: yearsAgo(30), aadhaar: aadhaar(1), skill: 'unskilled', wage: '14820.50', uan: '100123456789', esicIp: '3100123456', fromOn: today, toOn: null, ...p });
  const version = async (id: string) => (await inA((tx) => tx.contractDeployment.findFirstOrThrow({ where: { id } }))).version;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);
    planId = (await prisma.plan.create({ data: { name: `clra2-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CLRA2 Org ${k}`, slug: `clra2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['owner', 'A', 'panel', ['clra.contractor.manage', 'clra.contractor.view']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      ['hr', 'A', 'panel', ['clra.settings.manage']],
      ['other', 'A', 'panel', ['ats.staffing.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@clra2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@clra2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.owner}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      ids.entity = (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Foods Pvt Ltd', shortName: `KF2-${run}`, isDefault: true } })).id;
      const loc = (name: string, code: string, state: string) => tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity!, name, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } });
      ids.hosur = (await loc('Hosur plant', `HSR${run}`, 'IN-TN')).id;
      ids.blr = (await loc('Bengaluru head office', `BLR${run}`, 'IN-KA')).id;
    });
    ids.vendor = (await api('owner', 'post', '/contract-labour/contractors').send({ name: `Vetri Security ${run}`, work: 'Security' }).expect(want(201))).body.id;
    const lic = api('owner', 'post', `/contract-labour/contractors/${ids.vendor}/licences`);
    for (const [k, v] of Object.entries({ locationId: ids.hosur!, licenceNo: `TN/${run}`, scope: 'Security', states: 'IN-TN', maxWorkers: '2', validFrom: addDays(today, -30), validTo: addDays(today, 200) })) lic.field(k, v);
    ids.lic = (await lic.attach('file', Buffer.from(`%PDF-1.7\n${run}\n%%EOF`), { filename: 'l.pdf', contentType: 'application/pdf' }).expect(want(201))).body.id;
    await inA(async (tx) => tx.file.updateMany({ where: { id: (await tx.contractorLicence.findFirstOrThrow({ where: { id: ids.lic } })).fileId, scanStatus: 'pending' }, data: { scanStatus: 'clean', scannedAt: new Date() } }));
    await api('owner', 'post', `/contract-labour/licences/${ids.lic}/verify`).expect(want(201));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        for (const o of [org.A.id, org.B.id]) {
          await tx.$executeRawUnsafe(`DELETE FROM "contract_deployments" WHERE organization_id = $1::uuid`, o);
          await tx.$executeRawUnsafe(`DELETE FROM "contractor_licences" WHERE organization_id = $1::uuid`, o);
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('checks before sending: all pass; under 18, a site without a licence and a bad Aadhaar refused', async () => {
    const ok = (await api('owner', 'post', '/contract-labour/workers/check').send(worker()).expect(want(201))).body.checks;
    expect(ok.filter((c: { status: string }) => c.status === 'fail')).toEqual([]);
    const young = (await api('owner', 'post', '/contract-labour/workers/check').send(worker({ dob: yearsAgo(18, 1) })).expect(want(201))).body.checks;
    expect(young.find((c: { id: string }) => c.id === 'age')).toMatchObject({ status: 'fail' });
    const blr = (await api('owner', 'post', '/contract-labour/workers/check').send(worker({ locationId: ids.blr })).expect(want(201))).body.checks;
    expect(blr.find((c: { id: string }) => c.id === 'licence')).toMatchObject({ status: 'fail', detail: 'The contractor has no verified licence for this establishment.' });
    await api('owner', 'post', '/contract-labour/workers/check').send(worker({ aadhaar: '123456789012' })).expect(400);
    await api('owner', 'post', '/contract-labour/workers/check').send(worker({ dob: null })).expect(400);
    await api('reader', 'post', '/contract-labour/workers/check').send(worker()).expect(403);
  });

  it('send: a person with the contract_worker role, only the last 4 Aadhaar digits; blocks with the reasons, no override', async () => {
    await api('owner', 'post', '/contract-labour/workers').send(worker({ dob: yearsAgo(17) })).expect(400);
    const r = (await api('owner', 'post', '/contract-labour/workers').send(worker()).expect(want(201))).body;
    ids.w1 = r.id;
    ids.p1 = r.personId;
    const row = await inA((tx) => tx.contractDeployment.findFirstOrThrow({ where: { id: ids.w1 } }));
    expect(row).toMatchObject({ status: 'pending', idLast4: aadhaar(1).slice(-4), wagePaise: 1482050n, gatePassNo: null });
    expect(JSON.stringify(row, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(aadhaar(1));
    expect(row.idHash).toHaveLength(64);
    const role = await inA((tx) => tx.personRole.findFirstOrThrow({ where: { sourceTable: 'contract_deployments', sourceId: ids.w1 } }));
    expect(role).toMatchObject({ roleType: 'contract_worker', personId: ids.p1, endOn: null });
    expect(await inA((tx) => tx.employee.count({ where: { personId: ids.p1 } }))).toBe(0);
    expect(await inA((tx) => tx.user.count({ where: { email: { contains: 'kannan' } } }))).toBe(0);
    // The same ID again: already deployed (another contractor or site would be refused the same way).
    const dup = await api('owner', 'post', '/contract-labour/workers').send(worker({ givenName: 'Other' })).expect(400);
    expect(dup.body).toMatchObject({ code: 'DEPLOYMENT_BLOCKED' });
    expect(dup.body.checks.find((c: { id: string }) => c.id === 'dup')).toMatchObject({ status: 'fail' });
    ids.w2 = (await api('owner', 'post', '/contract-labour/workers').send(worker({ givenName: 'Selvi', aadhaar: aadhaar(2) })).expect(want(201))).body.id;
    const full = await api('owner', 'post', '/contract-labour/workers').send(worker({ givenName: 'Third', aadhaar: aadhaar(3) })).expect(400);
    expect(full.body.checks.find((c: { id: string }) => c.id === 'max')).toMatchObject({ status: 'fail' });
    await api('reader', 'post', '/contract-labour/workers').send(worker({ aadhaar: aadhaar(4) })).expect(403);
    await api('acting', 'post', '/contract-labour/workers').send(worker({ aadhaar: aadhaar(4) })).expect(403);
    await api('adminB', 'post', '/contract-labour/workers').send(worker({ aadhaar: aadhaar(4) })).expect(404);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'clra.worker.sent' } }))).toBe(2);
  });

  it('site approval: the induction within its months, then the gate pass ending first of licence and induction', async () => {
    const v = await version(ids.w1!);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v }).expect(400);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v, inductionOn: addDays(today, 1), inductionBy: 'Safety officer' }).expect(400);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v, inductionOn: yearsAgo(1, -1), inductionBy: 'Safety officer' }).expect(400);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v + 1, inductionOn: today, inductionBy: 'Safety officer' }).expect(409);
    await api('reader', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v, inductionOn: today, inductionBy: 'x' }).expect(403);
    await api('adminB', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v, inductionOn: today, inductionBy: 'x' }).expect(404);
    const induction = addDays(today, -300);
    const r = (await api('owner', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v, inductionOn: induction, inductionBy: 'Safety officer' }).expect(want(201))).body;
    expect(r.gatePass).toMatch(/^GP-HSR[A-Z0-9]*-0001$/);
    expect(r.gateValidTo).toBe([monthsLater(induction, 12), addDays(today, 200)].sort()[0]);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/approve`).send({ version: v + 1, inductionOn: today, inductionBy: 'x' }).expect(409);
    const list = (await api('reader', 'get', '/contract-labour/workers').expect(200)).body;
    expect(list.canManage).toBe(false);
    expect(list.workers.find((w: { id: string }) => w.id === ids.w1)).toMatchObject({ status: 'deployed', gatePass: r.gatePass, idMasked: `XXXX XXXX ${aadhaar(1).slice(-4)}`, wage: '14820.50' });
    for (const who of ['other', 'hr'] as const) await api(who, 'get', '/contract-labour/workers').expect(403);
    expect((await api('adminB', 'get', '/contract-labour/workers').expect(200)).body.workers).toEqual([]);
  });

  it('with the induction setting off, approval needs no induction', async () => {
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.induction_required', value: 'off' }] }).expect(want(200));
    const r = (await api('owner', 'post', `/contract-labour/workers/${ids.w2}/approve`).send({ version: await version(ids.w2!) }).expect(want(201))).body;
    expect(r.gateValidTo).toBe(addDays(today, 200));
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.induction_required', value: 'on' }, { key: 'clra.induction_months', value: '18' }] }).expect(400);
    await api('hr', 'put', '/contract-labour/settings').send({ changes: [{ key: 'clra.induction_required', value: 'on' }] }).expect(want(200));
  });

  it('release: today or earlier with a reason; the role ends; the same ID later keeps the same person', async () => {
    const v = await version(ids.w1!);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/release`).send({ version: v, on: addDays(today, 1), reason: 'Contract over' }).expect(400);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/release`).send({ version: v, on: today, reason: '' }).expect(400);
    await api('acting', 'post', `/contract-labour/workers/${ids.w1}/release`).send({ version: v, on: today, reason: 'Contract over' }).expect(403);
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/release`).send({ version: v, on: today, reason: 'Contract over' }).expect(want(201));
    await api('owner', 'post', `/contract-labour/workers/${ids.w1}/release`).send({ version: v + 1, on: today, reason: 'Again' }).expect(409);
    const role = await inA((tx) => tx.personRole.findFirstOrThrow({ where: { sourceTable: 'contract_deployments', sourceId: ids.w1 } }));
    expect(role.endOn?.toISOString().slice(0, 10)).toBe(today);
    const again = (await api('owner', 'post', '/contract-labour/workers').send(worker({ fromOn: addDays(today, 1) })).expect(want(201))).body;
    expect(again.personId).toBe(ids.p1);
  });

  it('work orders (675): add, change, a warning past the headcount; refused for others', async () => {
    const wo = { number: `WO/${run}`, fromOn: addDays(today, -10), toOn: addDays(today, 100), headcount: 2, locationIds: [ids.hosur] };
    await api('owner', 'post', `/contract-labour/contractors/${ids.vendor}/work-orders`).send({ ...wo, locationIds: [randomUUID()] }).expect(404);
    await api('owner', 'post', `/contract-labour/contractors/${ids.vendor}/work-orders`).send({ ...wo, toOn: addDays(today, -20) }).expect(400);
    await api('reader', 'post', `/contract-labour/contractors/${ids.vendor}/work-orders`).send(wo).expect(403);
    await api('adminB', 'post', `/contract-labour/contractors/${ids.vendor}/work-orders`).send(wo).expect(404);
    ids.wo = (await api('owner', 'post', `/contract-labour/contractors/${ids.vendor}/work-orders`).send(wo).expect(want(201))).body.id;
    await api('owner', 'post', `/contract-labour/contractors/${ids.vendor}/work-orders`).send(wo).expect(409);
    // Two are deployed or waiting at Hosur (Selvi and Kannan again): a third would pass the work order's 2.
    const checks = (await api('owner', 'post', '/contract-labour/workers/check').send(worker({ givenName: 'Four', aadhaar: aadhaar(5) })).expect(want(201))).body.checks;
    expect(checks.find((c: { id: string }) => c.id === 'workorder')).toMatchObject({ status: 'warn' });
    await api('owner', 'put', `/contract-labour/contractors/${ids.vendor}/work-orders/${ids.wo}`).send({ ...wo, headcount: 5, version: 1 }).expect(want(200));
    await api('owner', 'put', `/contract-labour/contractors/${ids.vendor}/work-orders/${ids.wo}`).send({ ...wo, headcount: 6, version: 1 }).expect(409);
    const c = (await api('reader', 'get', '/contract-labour/contractors').expect(200)).body.contractors[0];
    expect(c.workOrders[0]).toMatchObject({ number: `WO/${run}`, headcount: 5, active: 2, sites: [{ id: ids.hosur, name: 'Hosur plant' }] });
  });

  it('the site cards (674): workers against the licence maximum and the threshold', async () => {
    const e = (await api('reader', 'get', '/contract-labour/contractors').expect(200)).body.establishments;
    expect(e).toEqual([{ id: ids.hosur, name: 'Hosur plant', state: 'IN-TN', workers: 2, licenceMax: 2, threshold: 50, verify: true }]);
  });

  it('the directory (PPL-01): contract workers and their card for the contract labour keys', async () => {
    const d = (await api('admin', 'get', '/people/workforce').expect(200)).body;
    const cw = d.rows.filter((r: { kind: string }) => r.kind === 'contract_worker');
    expect(cw.map((r: { name: string; deployment: string; via: string }) => [r.name, r.deployment, r.via]).sort()).toEqual([
      ['Kannan S', 'Pending approval', `Vetri Security ${run}`],
      ['Selvi S', 'Deployed', `Vetri Security ${run}`],
    ]);
    expect(d.cards.contractWorkers).toEqual({ count: 2, previous: null });
    expect((await api('adminB', 'get', '/people/workforce').expect(200)).body.cards.contractWorkers).toEqual({ count: 0, previous: null });
  });
});
