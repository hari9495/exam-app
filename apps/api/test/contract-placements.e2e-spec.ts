import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { todayIst } from '../src/org-structure/org-validation';

// Contract workers and placements (founder decision 21 Oct 2026): roles on the person record that the People Directory
// counts. Deployment checks (age, licence valid, covering the site's state, within its maximum), the keys and their reach
// (company, legal entity, site), the Directory cards and the top-bar legal entity, and never another company.
describe('Contract workers and placements', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const day = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'siteA' | 'plainA' | 'hrB';
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ALL = ['employee.profile.view', 'org.structure.view', 'clra.worker.view', 'clra.worker.manage', 'staffing.placement.view', 'staffing.placement.manage'];
  const directory = async (who: Who, entity?: string) => (await api(who, 'get', `/people/workforce${entity ? `?legalEntityId=${entity}` : ''}`).expect(200)).body;
  const worker = (over: Record<string, unknown> = {}) => ({ contractorId: ids.contractor, licenceId: ids.licence, locationId: ids.hosur, givenName: 'Murugan', familyName: 'P.', dateOfBirth: '1990-03-12', work: 'Housekeeping', skill: 'unskilled', wage: '14820', fromOn: today, ...over });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `clb-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CLB ${k}`, slug: `clb-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
      await tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`tn${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Plant ${k}`, shortName: `T${k}${run}`, isDefault: true } })).id;
        ids[`ka${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Office ${k}`, shortName: `K${k}${run}` } })).id;
        const loc = (entity: string, name: string, code: string, state: string) => tx.location.create({ data: { ...o, legalEntityId: entity, name, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } });
        if (k === 'A') {
          ids.hosur = (await loc(ids.tnA, 'Hosur plant', 'HSR', 'IN-TN')).id;
          ids.chennai = (await loc(ids.tnA, 'Chennai office', 'MAA', 'IN-TN')).id;
          ids.blr = (await loc(ids.kaA, 'Bengaluru office', 'BLR', 'IN-KA')).id;
        } else ids.hosurB = (await loc(ids.tnB, 'Hosur plant', 'HSR', 'IN-TN')).id;
      });
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string[] | null][] = [
      ['hrA', 'A', ALL],
      ['siteA', 'A', null],
      ['plainA', 'A', ['employee.profile.view', 'org.structure.view']],
      ['hrB', 'B', ALL],
    ];
    for (const [name, k, keys] of roster) {
      const permissionProfileId = keys ? (await tenantPrisma.forTenant(ctx(k), (tx) => tx.permissionProfile.create({ data: { organizationId: org[k].id, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: `${name}-${run}@clb.test`, name: `${name} Person`, passwordHash, role: 'panel', permissionProfileId } }))).id;
    }
    // Plant HR: the HR view and contract workers, for the Hosur plant only.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const role = await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `plant-${run}`, permissionsJson: JSON.stringify(['employee.profile.view', 'clra.worker.view', 'staffing.placement.view']) } });
      await tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.siteA, permissionProfileId: role.id, scopeType: 'location', locationId: ids.hosur, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Plant HR', grantedBy: users.hrA } });
    });
    for (const [name, k] of roster) token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${name}-${run}@clb.test`, password: PASSWORD }).expect(200)).body.accessToken;

    const lic = { licenceNo: `TN/CL/${run}/1`, locationId: ids.hosur, states: ['IN-TN'], maxWorkers: 2, validFrom: day(-30), validTo: day(300) };
    ids.contractor = (await api('hrA', 'post', '/contract-labour/contractors').send({ legalEntityId: ids.tnA, name: 'Sri Lakshmi Facility Services', work: 'Housekeeping', pan: 'AAKFS4471L', licence: lic }).expect(201)).body.id;
    const list = (await api('hrA', 'get', '/contract-labour/contractors').expect(200)).body;
    ids.licence = list[0].licences[0].id;
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        for (const o of [org.A.id, org.B.id]) {
          await tx.contractDeployment.deleteMany({ where: { organizationId: o } });
          await tx.placement.deleteMany({ where: { organizationId: o } });
          await tx.contractorLicence.deleteMany({ where: { organizationId: o } });
        }
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('deploys a worker only when the checks pass, as a contract_worker role on a person record', async () => {
    const blocked = async (over: Record<string, unknown>, text: RegExp) => expect((await api('hrA', 'post', '/contract-labour/workers').send(worker(over)).expect(400)).body.message).toMatch(text);
    await blocked({ dateOfBirth: day(-17 * 366) }, /under 18/);
    await blocked({ fromOn: day(400) }, /not valid on the deployment date/);
    const first = (await api('hrA', 'post', '/contract-labour/workers').send(worker({ phone: '+91 94430 55120' })).expect(201)).body;
    expect(first.status).toBe('pending');
    await api('hrA', 'post', `/contract-labour/workers/${first.id}/approve`).expect(200);
    ids.worker = first.id;
    const role = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.personRole.findFirst({ where: { sourceId: first.id } }));
    expect(role).toMatchObject({ personId: first.personId, roleType: 'contract_worker', sourceTable: 'contract_deployments', endOn: null });
    // The same phone is the same person: never linked silently, and never deployed twice.
    expect((await api('hrA', 'post', '/contract-labour/workers').send(worker({ givenName: 'Murugan', phone: '+91 94430 55120' })).expect(409)).body.code).toBe('POSSIBLE_SAME_PERSON');
    await api('hrA', 'post', '/contract-labour/workers').send(worker({ personId: first.personId })).expect(409);
    // Second worker fills the licence (waiting for approval counts), the third is over its maximum.
    await api('hrA', 'post', '/contract-labour/workers').send(worker({ givenName: 'Selvi', dateOfBirth: '1994-08-21' })).expect(201);
    await blocked({ givenName: 'Kannan' }, /allows 2 workers; 2 are already deployed/);
    // A licence that does not cover the site's state, and a site of another legal entity.
    const other = (await api('hrA', 'post', `/contract-labour/contractors/${ids.contractor}/licences`).send({ licenceNo: `KA/CL/${run}/2`, locationId: ids.chennai, states: ['IN-KA'], maxWorkers: 5, validFrom: day(-1), validTo: day(100) }).expect(201)).body.id;
    await blocked({ licenceId: other, locationId: ids.chennai, givenName: 'Kannan' }, /does not cover the site's state/);
    await api('hrA', 'post', '/contract-labour/workers').send(worker({ locationId: ids.blr, givenName: 'Kannan' })).expect(400);
  });

  it('creates placements with their rules, as a placement role', async () => {
    await api('hrA', 'post', '/staffing/placements').send({ legalEntityId: ids.kaA, givenName: 'Aravind', familyName: 'Kumar', client: 'Nilgiri Retail', role: 'Java Developer', startOn: day(-10), endOn: day(200), billRate: '1200', payRate: '800', supply: 'vendor' }).expect(400);
    const p = (await api('hrA', 'post', '/staffing/placements').send({ legalEntityId: ids.kaA, givenName: 'Aravind', familyName: 'Kumar', client: 'Nilgiri Retail', role: 'Java Developer', startOn: day(-10), endOn: day(200), billRate: '1200', payRate: '800', statutoryPerHour: '96', supply: 'own' }).expect(201)).body;
    ids.placement = p.id;
    const list = (await api('hrA', 'get', '/staffing/placements').expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ name: 'Aravind Kumar', client: 'Nilgiri Retail', billRate: '1200.00', payRate: '800.00', statutoryPerHour: '96.00', status: 'active' })]);
  });

  it('the Directory counts workers on site and active placements, by the top-bar legal entity', async () => {
    const all = await directory('hrA');
    expect(all.cards.contractWorkers).toEqual({ count: 1, previous: null });
    expect(all.cards.placements).toEqual({ count: 1, previous: null });
    expect(all.cards.persons).toMatchObject({ roles: 2, people: 2 });
    expect(all.rows.filter((r: { kind: string }) => r.kind !== 'employee').map((r: { kind: string; name: string; via: string; roleStatus: string }) => [r.kind, r.name, r.via, r.roleStatus])).toEqual([
      ['contract_worker', 'Murugan P.', 'Sri Lakshmi Facility Services', 'Deployed'],
      ['placement', 'Aravind Kumar', 'Nilgiri Retail', 'On assignment'],
    ]);
    const tn = await directory('hrA', ids.tnA);
    expect([tn.cards.contractWorkers.count, tn.cards.placements.count]).toEqual([1, 0]);
    const ka = await directory('hrA', ids.kaA);
    expect([ka.cards.contractWorkers.count, ka.cards.placements.count]).toEqual([0, 1]);
  });

  it('a site-scoped plant HR sees the workers of their site only, and cannot deploy; no key, no cards', async () => {
    const site = await directory('siteA');
    expect(site.cards.contractWorkers.count).toBe(1);
    // A site scope does not reach a client's site: no placements in reach, so the card shows none.
    expect(site.cards.placements).toBeNull();
    expect((await api('siteA', 'get', '/contract-labour/workers').expect(200)).body.map((w: { name: string }) => w.name).sort()).toEqual(['Murugan P.', 'Selvi P.']);
    await api('siteA', 'post', '/contract-labour/workers').send(worker({ givenName: 'Kannan' })).expect(403);
    const plain = await directory('plainA');
    expect([plain.cards.contractWorkers, plain.cards.placements]).toEqual([null, null]);
    expect(plain.rows.some((r: { kind: string }) => r.kind !== 'employee')).toBe(false);
    await api('plainA', 'get', '/contract-labour/workers').expect(403);
    await api('plainA', 'get', '/staffing/placements').expect(403);
  });

  it("never shows or changes another company's workers or placements", async () => {
    expect((await api('hrB', 'get', '/contract-labour/workers').expect(200)).body).toEqual([]);
    expect((await api('hrB', 'get', '/contract-labour/contractors').expect(200)).body).toEqual([]);
    expect((await api('hrB', 'get', '/staffing/placements').expect(200)).body).toEqual([]);
    await api('hrB', 'post', `/contract-labour/workers/${ids.worker}/release`).expect(404);
    await api('hrB', 'post', `/staffing/placements/${ids.placement}/end`).send({ endedOn: today, reason: 'Not ours' }).expect(404);
    await api('hrB', 'post', '/contract-labour/workers').send({ ...worker(), locationId: ids.hosurB }).expect(404);
    const b = await directory('hrB');
    expect([b.cards.contractWorkers.count, b.cards.placements.count]).toEqual([0, 0]);
  });

  it('releasing and ending take them off the Directory and end their roles', async () => {
    await api('hrA', 'post', `/contract-labour/workers/${ids.worker}/release`).expect(200);
    await api('hrA', 'post', `/staffing/placements/${ids.placement}/end`).send({ endedOn: today, reason: 'Client ended the project' }).expect(200);
    const all = await directory('hrA');
    expect([all.cards.contractWorkers.count, all.cards.placements.count]).toEqual([0, 0]);
    const roles = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.personRole.findMany({ where: { sourceId: { in: [ids.worker, ids.placement] } } }));
    expect(roles.every((r) => r.endOn !== null)).toBe(true);
  });
});
