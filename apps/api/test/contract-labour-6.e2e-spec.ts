import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Contract labour CL-6 end to end (CLB-04, founder answers 629, 630): the month's registers per establishment from the
// deployments and the contractors' wage registers, in the state's format (IN.CLRA.REGISTERS); the muster and wages
// wait for a contractor without a wage register; a new version needs a reason; the versions are statutory_registers, so
// freezing and the DSC signature are the payroll routes (and payroll's own registers never mix with them). The annual
// return is drafted; the filing is recorded once with its day and reference. Refused: without the key 403, acting
// 403, another company 404, bad input 400, a repeat 409.

jest.setTimeout(240_000);

describe('Contract labour CL-6: registers and the annual return', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'owner' | 'reader' | 'signer' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const asSuper = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const year = Number(today.slice(0, 4));
  const lastYear = year - 1;
  const month = (() => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const binary = (req: request.Test) => req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService).useValue(createFakeBlobStorage())
      .compile();
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

    planId = (await prisma.plan.create({ data: { name: `cl6-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CL6 Org ${k} ${run}`, slug: `cl6-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['owner', 'A', 'panel', ['clra.contractor.manage', 'clra.contractor.view']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      // The company's register signer (the compliance owner role of payroll): freezes and signs with the DSC.
      ['signer', 'A', 'panel', tpl('compliance_owner')],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@cl6-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.hsr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const file = async () => (await tx.file.create({ data: { ...o, area: 'clra', storageRef: `x/${randomUUID()}`, fileName: 'f.pdf', mime: 'application/pdf', size: 1, sha256: 'a'.repeat(64), uploadedVia: 'staff' } })).id;
      const agency = (name: string) => tx.agency.create({ data: { ...o, name: `${name} ${run}`, portalToken: randomUUID(), contractLabour: true, work: 'Housekeeping' } });
      ids.a1 = (await agency('Sri Lakshmi Facility Services')).id;
      ids.a2 = (await agency('Vetri Security')).id;
      await tx.contractorLicence.create({ data: { ...o, agencyId: ids.a1, locationId: ids.hsr, licenceNo: 'TN/CL/2025/0101', scope: 'Housekeeping', states: ['IN-TN'], maxWorkers: 40, validFrom: day(`${lastYear}-01-01`), validTo: day(`${year + 1}-12-31`), fileId: await file(), status: 'verified', decidedAt: new Date() } });
      // Three workers since 1 Nov last year (two from Sri Lakshmi, one from Vetri), approved.
      const deps: string[] = [];
      for (const [i, a] of [[1, ids.a1], [2, ids.a1], [3, ids.a2]] as const) {
        const p = await tx.person.create({ data: { ...o, givenName: `Worker${i}`, familyName: run } });
        deps.push((await tx.contractDeployment.create({ data: { ...o, personId: p.id, agencyId: a, locationId: ids.hsr, skill: 'unskilled', dob: day('1990-01-01'), idLast4: `100${i}`, idHash: String(i).repeat(64), fromOn: day(`${lastYear}-11-01`), status: 'deployed', gatePassNo: `GP-${run}-${i}`, gateValidTo: day(`${year + 1}-12-31`), approvedAt: new Date(`${lastYear}-11-01T00:00:00Z`) } })).id);
      }
      ids.d1 = deps[0]!;
      ids.d3 = deps[2]!;
      // Sri Lakshmi's wage registers: last month and December last year. Vetri has none for last month yet.
      const wages = async (agencyId: string, m: string, lines: [string, number, number][]) => {
        const pack = await tx.contractorPack.create({ data: { ...o, agencyId, locationId: ids.hsr, month: day(`${m}-01`) } });
        await tx.contractorPackItem.create({ data: { ...o, packId: pack.id, kind: 'wage_register', fileId: await file() } });
        for (const [dep, days, rupees] of lines) await tx.contractorWageLine.create({ data: { ...o, packId: pack.id, deploymentId: dep, days, grossPaise: BigInt(rupees * 100), paidOn: day(`${m}-28`) } });
      };
      await wages(ids.a1, month, [[deps[0]!, 26, 15600], [deps[1]!, 24, 14400]]);
      await wages(ids.a1, `${lastYear}-12`, [[deps[0]!, 25, 15000], [deps[1]!, 25, 15000]]);
      ids.addWages = 'later';
    });
    for (const [who, k] of [['admin', 'A'], ['owner', 'A'], ['reader', 'A'], ['signer', 'A'], ['adminB', 'B']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@cl6-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.owner}`).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      const all = Object.values(users) as string[];
      await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
      await tx.session.deleteMany({ where: { userId: { in: all } } });
      await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
    }).catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('629 registers: made per establishment after the month; muster and wages wait for a contractor; refusals', async () => {
    const empty = (await api('reader', 'get', `/contract-labour/registers?month=${month}`).expect(want(200))).body;
    expect(empty).toMatchObject({ canMake: false, establishments: [{ id: ids.hsr, name: 'Hosur plant' }], registers: [], waiting: [{ locationId: ids.hsr, contractors: [`Vetri Security ${run}`] }] });
    expect(empty.chart.series[0].values.at(-1)).toBe(3);
    await api('reader', 'post', '/contract-labour/registers').send({ month, locationId: ids.hsr }).expect(403);
    await api('acting', 'post', '/contract-labour/registers').send({ month, locationId: ids.hsr }).expect(403);
    await api('adminB', 'post', '/contract-labour/registers').send({ month, locationId: ids.hsr }).expect(404);
    await api('owner', 'post', '/contract-labour/registers').send({ month: today.slice(0, 7), locationId: ids.hsr }).expect(400);
    await api('owner', 'post', '/contract-labour/registers').send({ month: '2026-13', locationId: ids.hsr }).expect(400);
    const made = (await api('owner', 'post', '/contract-labour/registers').send({ month, locationId: ids.hsr }).expect(want(201))).body;
    expect(made.registers.map((r: { type: string }) => r.type).sort()).toEqual(['clra_contractors', 'clra_workmen']);
    expect(made.waiting).toEqual([`Vetri Security ${run}`]);
    const workmen = made.registers.find((r: { type: string }) => r.type === 'clra_workmen');
    expect(workmen.rows).toBe(3);
    await api('owner', 'post', '/contract-labour/registers').send({ month, locationId: ids.hsr }).expect(400);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'clra.registers.generated' } }))).toBe(1);
  });

  it('629 once every contractor has a wage register: all four, as a new version with the reason; the PDF reads for readers only in this company', async () => {
    await inA(async (tx) => {
      const pack = await tx.contractorPack.create({ data: { organizationId: org.A.id, agencyId: ids.a2, locationId: ids.hsr, month: day(`${month}-01`) } });
      const fileId = (await tx.file.create({ data: { organizationId: org.A.id, area: 'clra', storageRef: `x/${randomUUID()}`, fileName: 'w.pdf', mime: 'application/pdf', size: 1, sha256: 'b'.repeat(64), uploadedVia: 'staff' } })).id;
      await tx.contractorPackItem.create({ data: { organizationId: org.A.id, packId: pack.id, kind: 'wage_register', fileId } });
      await tx.contractorWageLine.create({ data: { organizationId: org.A.id, packId: pack.id, deploymentId: ids.d3, days: 30, grossPaise: 1800000n, paidOn: day(`${month}-28`) } });
    });
    const v2 = (await api('owner', 'post', '/contract-labour/registers').send({ month, locationId: ids.hsr, reason: 'Vetri sent its wage register' }).expect(want(201))).body;
    expect(v2.registers.map((r: { type: string }) => r.type).sort()).toEqual(['clra_contractors', 'clra_muster', 'clra_wages', 'clra_workmen']);
    expect(v2.registers.find((r: { type: string }) => r.type === 'clra_contractors').version).toBe(2);
    expect(v2.registers.find((r: { type: string }) => r.type === 'clra_muster').version).toBe(1);
    expect(v2.waiting).toEqual([]);
    const list = (await api('reader', 'get', `/contract-labour/registers?month=${month}`).expect(200)).body;
    expect(list.registers).toHaveLength(4);
    expect(list.registers.every((r: { status: string }) => r.status === 'generated')).toBe(true);
    ids.wages = list.registers.find((r: { type: string }) => r.type === 'clra_wages').id;
    const f = await binary(api('reader', 'get', `/contract-labour/registers/${ids.wages}/file`)).expect(want(200));
    expect((f.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    await api('adminB', 'get', `/contract-labour/registers/${ids.wages}/file`).expect(404);
    // Payroll's own registers of the entity never list these.
    await markSteppedUp(tenantPrisma, token.signer!);
    expect((await api('signer', 'get', `/statutory/registers?entityId=${ids.entity}&month=${month}`).expect(200)).body).toEqual([]);
  });

  it('629 frozen and signed through the payroll registers service: the signer (with step-up) freezes; an unsigned upload is refused', async () => {
    await api('owner', 'post', `/statutory/registers/${ids.wages}/freeze`).expect(403);
    await api('signer', 'post', `/statutory/registers/${ids.wages}/freeze`).expect(want(200));
    expect((await api('reader', 'get', `/contract-labour/registers?month=${month}`).expect(200)).body.registers.find((r: { id: string }) => r.id === ids.wages).status).toBe('frozen');
    const refused = await api('signer', 'post', `/statutory/registers/${ids.wages}/sign`).attach('file', Buffer.from('%PDF-1.4 not signed'), 'w.pdf').expect(400);
    expect(refused.body.code).toBe('SIGNATURE_REFUSED');
    // A frozen register never changes; a new version supersedes it with the reason.
    const v3 = (await api('owner', 'post', '/contract-labour/registers').send({ month, locationId: ids.hsr, reason: 'Corrected days' }).expect(201)).body;
    expect(v3.registers.find((r: { type: string }) => r.type === 'clra_wages').version).toBe(2);
    // The register table's pay guard holds for everyone: the check opens it to the entity, as the services do.
    const old = await asSuper(async (tx) => (await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`, tx.statutoryRegister.findUniqueOrThrow({ where: { id: ids.wages } })));
    expect(old).toMatchObject({ status: 'superseded' });
  });

  it('630 the annual return: drafted from the year; the filing recorded once with its day and reference; refusals', async () => {
    const r = (await api('reader', 'get', `/contract-labour/returns?year=${lastYear}`).expect(want(200))).body;
    expect(r.canFile).toBe(false);
    expect(r.returns).toHaveLength(1);
    expect(r.returns[0]).toMatchObject({ locationId: ids.hsr, due: `${year}-02-15`, filed: null, figures: { contractors: 2, workers: 3, maxWorkersOnADay: 3, daysWorked: 50, wagesPaid: '30000.00' } });
    const pdf = await binary(api('reader', 'get', `/contract-labour/returns/${ids.hsr}/${lastYear}/draft.pdf`)).expect(want(200));
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const path = `/contract-labour/returns/${ids.hsr}/${lastYear}/filed`;
    const ok = { filedOn: `${year}-01-20`, reference: 'CLC/TN/00417' };
    await api('reader', 'post', path).send(ok).expect(403);
    await api('acting', 'post', path).send(ok).expect(403);
    await api('adminB', 'post', path).send(ok).expect(404);
    await api('owner', 'post', path).send({ ...ok, reference: 'x' }).expect(400);
    await api('owner', 'post', path).send({ ...ok, filedOn: `${lastYear}-12-31` }).expect(400);
    await api('owner', 'post', path).send({ ...ok, filedOn: `${year + 1}-01-01` }).expect(400);
    await api('owner', 'post', `/contract-labour/returns/${ids.hsr}/${year}/filed`).send(ok).expect(400);
    if (ok.filedOn <= today) {
      await api('owner', 'post', path).send(ok).expect(want(201));
      await api('owner', 'post', path).send(ok).expect(409);
      const after = (await api('reader', 'get', `/contract-labour/returns?year=${lastYear}`).expect(200)).body;
      expect(after.returns[0].filed).toMatchObject({ on: ok.filedOn, reference: 'CLC/TN/00417' });
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'clra.return.filed' } }))).toBe(1);
    }
  });
});
