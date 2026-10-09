import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, STEP_UP_REQUIRED_CODE, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';
import { markSteppedUp } from './fixtures/step-up';

// P01 organisation structure end to end, against the real database (forced RLS, app role): legal
// entities with Confidential identifiers, locations, structure masters with shared / entity-only
// ownership and trees, dated grade pay ranges (pay is private, R1) and scoped settings.
describe('Organisation structure (P01 §4.1–4.3, §4.6; YX-ORG-01..05, 08, 12, 15, 18, 30; P06; R1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const future = addDays(today, 30);
  const past = addDays(today, -200);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'adminA' | 'adminB' | 'payrollA' | 'panelA' | 'auditorA';
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) =>
    request(server())[method](`/api/v1/org${path}`).set('Authorization', `Bearer ${token[who]}`);
  const address = (state = 'IN-KA', city = 'Bengaluru', postalCode = '560025') => ({ lines: ['14 Residency Road'], city, state, postalCode, country: 'IN' });
  const auditActions = async (organizationId: string, prefix: string) =>
    (await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId, action: { startsWith: prefix } }, orderBy: { createdAt: 'asc' } }))).map((a) => ({ action: a.action, metadata: a.metadataJson }));

  // Filled as the suite runs.
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `org-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `org-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const profile = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) =>
      tx.permissionProfile.create({ data: { organizationId: org.A.id, name: 'Payroll Admin', permissionsJson: JSON.stringify(['org:view', 'org.structure.view', 'org.entity.statutory.manage', 'pay.range.view', 'pay.range.manage']) } }),
    );
    const people: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payrollA', 'A', 'panel', profile.id],
      ['panelA', 'A', 'panel', null],
      ['auditorA', 'A', 'auditor', null],
    ];
    for (const [name, k, role, permissionProfileId] of people) {
      users[name] = (
        await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: org[k].id, email: `${name}-${runId}@org.test`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      const res = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${name}-${runId}@org.test`, password: PASSWORD }).expect(200);
      token[name] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    const orgIds = [org.A.id, org.B.id];
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
        await tx.permissionProfile.deleteMany({ where: { organizationId: { in: orgIds } } });
        await tx.organization.deleteMany({ where: { id: { in: orgIds } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('permissions (P02 YX-SEC-01)', () => {
    it('a user without an organisation grant gets 403 on every route; the auditor may only read', async () => {
      await api('panelA', 'get', '/legal-entities').expect(403);
      await api('panelA', 'get', '/masters/departments').expect(403);
      await api('panelA', 'get', '/settings').expect(403);
      await api('panelA', 'post', '/legal-entities').send({ name: 'X', shortName: 'X' }).expect(403);
      await api('auditorA', 'get', '/legal-entities').expect(200);
      await api('auditorA', 'post', '/legal-entities').send({ name: 'X', shortName: 'X' }).expect(403);
      await api('auditorA', 'post', '/masters/grades').send({ name: 'G', rank: 1 }).expect(403);
      await request(server()).get('/api/v1/org/legal-entities').expect(401);
    });

    it('screens can ask which of these keys the person holds (profile or role, as the guard resolves them)', async () => {
      const keys = 'org.structure.view,org.settings.manage,org.entity.statutory.manage,pay.range.view,pay.range.manage';
      const mine = (who: Who) => request(server()).get(`/api/v1/rbac/me/permissions?keys=${keys}`).set('Authorization', `Bearer ${token[who]}`).expect(200);
      expect((await mine('adminA')).body).toEqual(['org.structure.view', 'org.settings.manage']);
      expect((await mine('payrollA')).body).toEqual(['org.structure.view', 'org.entity.statutory.manage', 'pay.range.view', 'pay.range.manage']);
      expect((await mine('panelA')).body).toEqual([]);
      await request(server()).get('/api/v1/rbac/me/permissions?keys=DROP TABLE').set('Authorization', `Bearer ${token.adminA}`).expect(400);
    });
  });

  describe('legal entities (P01 §4.1; YX-ORG-01, YX-ORG-30)', () => {
    it('the first entity becomes the default; the next does not', async () => {
      const first = await api('adminA', 'post', '/legal-entities').send({ name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', registeredAddress: address() }).expect(201);
      expect(first.body).toMatchObject({ isDefault: true, country: 'IN', currency: 'INR', fyStartMonth: 4, dataRegion: 'IN', statutory: { pan: false, tan: false, gstin: false, cin: false } });
      const second = await api('adminA', 'post', '/legal-entities').send({ name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', shortName: 'KFPL-TN' }).expect(201);
      expect(second.body.isDefault).toBe(false);
      ids.kfpl = first.body.id;
      ids.tn = second.body.id;
      ids.bEntity = (await api('adminB', 'post', '/legal-entities').send({ name: 'Other Co', shortName: 'KFPL' }).expect(201)).body.id; // same short name, other company
    });

    it('short names are unique per company, case-insensitively', async () => {
      const res = await api('adminA', 'post', '/legal-entities').send({ name: 'Copy', shortName: 'kfpl' }).expect(409);
      expect(res.body.message).toMatch(/short name/);
    });

    it('YX-ORG-30: the data region must be live and serve the country; both are fixed afterwards', async () => {
      await api('adminA', 'post', '/legal-entities').send({ name: 'EU Co', shortName: 'EUCO', country: 'DE', dataRegion: 'EU' }).expect(400);
      await api('adminA', 'post', '/legal-entities').send({ name: 'UAE Co', shortName: 'AECO', country: 'AE' }).expect(400);
      await api('adminA', 'put', `/legal-entities/${ids.tn}`).send({ name: 'Kaveri TN', shortName: 'KFPL-TN', country: 'AE' }).expect(400);
      await api('adminA', 'post', '/legal-entities').send({ name: 'Bad', shortName: 'BAD', currency: 'XYZ' }).expect(400);
      await api('adminA', 'post', '/legal-entities').send({ name: 'Bad', shortName: 'BAD', registeredAddress: { ...address(), state: 'IN-ZZ' } }).expect(400);
      await api('adminA', 'post', '/legal-entities').send({ name: 'Bad', shortName: 'BAD', isDefault: true }).expect(400); // not whitelisted
      // Even the app's own database role cannot move it.
      await expect(tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) => tx.legalEntity.update({ where: { id: ids.tn }, data: { dataRegion: 'EU' } }))).rejects.toThrow(/fixed at creation/);
    });

    it('YX-ORG-01: exactly one default; it can be moved but never archived or deleted', async () => {
      await api('adminA', 'post', `/legal-entities/${ids.kfpl}/archive`).expect(409);
      await api('adminA', 'delete', `/legal-entities/${ids.kfpl}`).expect(409);
      const moved = await api('adminA', 'post', `/legal-entities/${ids.tn}/default`).expect(200);
      expect(moved.body.isDefault).toBe(true);
      const list = (await api('adminA', 'get', '/legal-entities').expect(200)).body as { id: string; isDefault: boolean }[];
      expect(list.filter((e) => e.isDefault).map((e) => e.id)).toEqual([ids.tn]);
      await api('adminA', 'post', `/legal-entities/${ids.kfpl}/default`).expect(200);
    });

    it('an unused, non-default entity can be archived, restored and deleted', async () => {
      const spare = (await api('adminA', 'post', '/legal-entities').send({ name: 'Spare', shortName: 'SPARE' }).expect(201)).body.id;
      await api('adminA', 'post', `/legal-entities/${spare}/archive`).expect(200);
      expect((await api('adminA', 'get', '/legal-entities').expect(200)).body.map((e: { id: string }) => e.id)).not.toContain(spare);
      expect((await api('adminA', 'get', '/legal-entities?includeArchived=true').expect(200)).body.map((e: { id: string }) => e.id)).toContain(spare);
      await api('adminA', 'post', `/legal-entities/${spare}/default`).expect(400); // archived can't be chosen (YX-ORG-04)
      await api('adminA', 'post', `/legal-entities/${spare}/restore`).expect(200);
      await api('adminA', 'delete', `/legal-entities/${spare}`).expect(204);
      expect((await auditActions(org.A.id, 'org.legal_entity.')).map((a) => a.action)).toEqual(
        expect.arrayContaining(['org.legal_entity.created', 'org.legal_entity.default_changed', 'org.legal_entity.archived', 'org.legal_entity.restored', 'org.legal_entity.deleted']),
      );
    });
  });

  describe('Confidential entity identifiers (P02 §4.4, YX-SEC-09)', () => {
    const IDS = { pan: 'AABCK1234M', tan: 'BLRK01234E', gstin: '29AABCK1234M1Z5', cin: 'U15400KA2014PTC012345' };

    it('the System Admin can neither read nor write them without the grant (P02 Q1)', async () => {
      await api('adminA', 'get', `/legal-entities/${ids.kfpl}/statutory`).expect(403);
      await api('adminA', 'put', `/legal-entities/${ids.kfpl}/statutory`).send(IDS).expect(403);
      await api('adminA', 'put', `/legal-entities/${ids.kfpl}`).send({ name: 'Kaveri Foods Pvt Ltd', shortName: 'KFPL', pan: IDS.pan }).expect(400);
    });

    it('a change needs step-up; formats are checked; the GSTIN must carry the PAN', async () => {
      const refused = await api('payrollA', 'put', `/legal-entities/${ids.kfpl}/statutory`).send(IDS).expect(403);
      expect(refused.body.code).toBe(STEP_UP_REQUIRED_CODE);
      await markSteppedUp(tenantPrisma, token.payrollA);
      await api('payrollA', 'put', `/legal-entities/${ids.kfpl}/statutory`).send({ ...IDS, pan: 'AABCK1234' }).expect(400);
      await api('payrollA', 'put', `/legal-entities/${ids.kfpl}/statutory`).send({ ...IDS, pan: 'ZZZZZ9999Z' }).expect(400);
      const saved = await api('payrollA', 'put', `/legal-entities/${ids.kfpl}/statutory`).send(IDS).expect(200);
      expect(saved.body.statutory).toEqual({ pan: true, tan: true, gstin: true, cin: true });
      await api('payrollA', 'put', `/legal-entities/${ids.kfpl}/statutory`).send({ cin: 'AAB-1234' }).expect(200); // an LLPIN
    });

    it('lists show only whether each is on file; the values are read through an audited call', async () => {
      const list = await api('adminA', 'get', '/legal-entities').expect(200);
      const text = JSON.stringify(list.body);
      for (const v of Object.values(IDS)) expect(text).not.toContain(v);
      const values = await api('payrollA', 'get', `/legal-entities/${ids.kfpl}/statutory`).expect(200);
      expect(values.body).toEqual({ ...IDS, cin: 'AAB-1234' });
      const trail = await auditActions(org.A.id, 'org.legal_entity.statutory');
      expect(trail.map((a) => a.action)).toEqual(['org.legal_entity.statutory_changed', 'org.legal_entity.statutory_changed', 'org.legal_entity.statutory_viewed']);
      for (const v of Object.values(IDS)) expect(JSON.stringify(trail)).not.toContain(v);
    });

    it('another company cannot read them, even with the grant', async () => {
      await api('payrollA', 'get', `/legal-entities/${ids.bEntity}/statutory`).expect(404);
    });
  });

  describe('locations (P01 §4.2; YX-ORG-02, YX-ORG-08)', () => {
    const body = (over: object = {}) => ({ legalEntityId: ids.kfpl, name: 'Bengaluru head office', address: address(), timezone: 'Asia/Kolkata', geofence: { lat: 12.9716, lng: 77.5946, radiusM: 150 }, ipRanges: ['203.0.113.0/24'], ...over });

    it('creates a site with a generated code; state and time zone are required and real', async () => {
      const res = await api('adminA', 'post', '/locations').send(body()).expect(201);
      expect(res.body).toMatchObject({ code: 'BENGALURU-HEAD-OFFICE', state: 'IN-KA', country: 'IN', timezone: 'Asia/Kolkata', geofence: { lat: 12.9716, lng: 77.5946, radiusM: 150 }, ipRanges: ['203.0.113.0/24'] });
      ids.blr = res.body.id;
      ids.hosur = (await api('adminA', 'post', '/locations').send(body({ legalEntityId: ids.tn, name: 'Hosur plant', code: 'HSR', address: address('IN-TN', 'Hosur', '635126') })).expect(201)).body.id;
      await api('adminA', 'post', '/locations').send(body({ name: 'No zone', timezone: undefined })).expect(400);
      await api('adminA', 'post', '/locations').send(body({ name: 'Bad zone', timezone: 'Mars/Olympus' })).expect(400);
      await api('adminA', 'post', '/locations').send(body({ name: 'No state', address: { ...address(), state: undefined } })).expect(400);
      await api('adminA', 'post', '/locations').send(body({ name: 'Bad state', address: address('IN-QQ') })).expect(400);
      await api('adminA', 'post', '/locations').send(body({ name: 'Half fence', geofence: { lat: 12.9 } })).expect(400);
      await api('adminA', 'post', '/locations').send(body({ name: 'Bad range', ipRanges: ['10.0.0.300/8'] })).expect(400);
      await api('adminA', 'post', '/locations').send(body({ name: 'Copy', code: 'hsr' })).expect(409);
    });

    it('YX-ORG-08: a site belongs to one active entity of the same company and never changes entity', async () => {
      await api('adminA', 'post', '/locations').send(body({ name: 'Elsewhere', legalEntityId: ids.bEntity })).expect(400);
      await api('adminA', 'put', `/locations/${ids.blr}`).send(body({ legalEntityId: ids.tn })).expect(400);
      const edited = await api('adminA', 'put', `/locations/${ids.blr}`).send(body({ name: 'Bengaluru HQ', geofence: null })).expect(200);
      expect(edited.body).toMatchObject({ name: 'Bengaluru HQ', code: 'BENGALURU-HEAD-OFFICE', geofence: null });
    });

    it('an entity with live sites cannot be archived; archived entities take no new sites', async () => {
      const spare = (await api('adminA', 'post', '/legal-entities').send({ name: 'Spare 2', shortName: 'SPARE2' }).expect(201)).body.id;
      const site = (await api('adminA', 'post', '/locations').send(body({ legalEntityId: spare, name: 'Spare site' })).expect(201)).body.id;
      const refused = await api('adminA', 'post', `/legal-entities/${spare}/archive`).expect(409);
      expect(refused.body.message).toMatch(/1 location/);
      await api('adminA', 'delete', `/legal-entities/${spare}`).expect(409); // still referenced (YX-ORG-04)
      await api('adminA', 'post', `/locations/${site}/archive`).expect(200);
      await api('adminA', 'post', `/legal-entities/${spare}/archive`).expect(200);
      await api('adminA', 'post', '/locations').send(body({ legalEntityId: spare, name: 'Too late' })).expect(400);
      await api('adminA', 'post', `/locations/${site}/restore`).expect(400);
    });

    it("another company's sites are invisible and untouchable", async () => {
      expect((await api('adminB', 'get', '/locations').expect(200)).body).toEqual([]);
      await api('adminB', 'put', `/locations/${ids.blr}`).send(body({ legalEntityId: ids.bEntity })).expect(404);
      await api('adminB', 'post', `/locations/${ids.blr}/archive`).expect(404);
      await api('adminB', 'delete', `/locations/${ids.blr}`).expect(404);
    });
  });

  describe('departments: tree, divisions and ownership (P01 §4.3; YX-ORG-03, YX-ORG-05, YX-ORG-15)', () => {
    const dept = (body: object, who: Who = 'adminA') => api(who, 'post', '/masters/departments').send(body);

    it('builds a tree; a division is top-level only', async () => {
      ids.ops = (await dept({ name: 'Operations', isDivision: true }).expect(201)).body.id;
      ids.quality = (await dept({ name: 'Quality', parentId: ids.ops }).expect(201)).body.id;
      ids.lab = (await dept({ name: 'Lab', parentId: ids.quality }).expect(201)).body.id;
      ids.sales = (await dept({ name: 'Sales', code: 'SALES' }).expect(201)).body.id;
      await dept({ name: 'Sub-division', parentId: ids.ops, isDivision: true }).expect(400);
      const list = (await api('adminA', 'get', '/masters/departments').expect(200)).body as { id: string; code: string; parentId: string | null }[];
      expect(list.find((d) => d.id === ids.quality)).toMatchObject({ code: 'QUALITY', parentId: ids.ops });
      expect(JSON.stringify(list)).not.toContain('"path"');
    });

    it('YX-ORG-03: no cycles; moving a department moves its subtree', async () => {
      await api('adminA', 'put', `/masters/departments/${ids.ops}`).send({ name: 'Operations', parentId: ids.lab }).expect(400);
      await api('adminA', 'put', `/masters/departments/${ids.quality}`).send({ name: 'Quality', parentId: ids.quality }).expect(400);
      await api('adminA', 'put', `/masters/departments/${ids.quality}`).send({ name: 'Quality', parentId: ids.sales }).expect(200);
      const paths = await tenantPrisma.forTenant(SUPER, (tx) => tx.department.findMany({ where: { id: { in: [ids.quality, ids.lab] } }, select: { id: true, path: true } }));
      expect(paths.find((p) => p.id === ids.lab)!.path).toBe(`/${ids.sales}/${ids.quality}/${ids.lab}/`);
      await api('adminA', 'put', `/masters/departments/${ids.quality}`).send({ name: 'Quality', parentId: ids.ops }).expect(200);
    });

    it('YX-ORG-15: entity-only under shared is fine; shared under entity-only, or across entities, is not', async () => {
      ids.prod = (await dept({ name: 'Production', parentId: ids.ops, ownerLegalEntityId: ids.tn }).expect(201)).body.id;
      await dept({ name: 'Packing', parentId: ids.prod }).expect(400); // shared under entity-only
      await dept({ name: 'Packing', parentId: ids.prod, ownerLegalEntityId: ids.kfpl }).expect(400); // other entity
      ids.packing = (await dept({ name: 'Packing', parentId: ids.prod, ownerLegalEntityId: ids.tn }).expect(201)).body.id;
      await api('adminA', 'put', `/masters/departments/${ids.prod}`).send({ name: 'Production', parentId: ids.ops, ownerLegalEntityId: null }).expect(200);
      // Production is shared again with an entity-only child: it cannot become another entity's.
      await api('adminA', 'put', `/masters/departments/${ids.prod}`).send({ name: 'Production', parentId: ids.ops, ownerLegalEntityId: ids.kfpl }).expect(400);
      await dept({ name: 'Elsewhere', ownerLegalEntityId: ids.bEntity }).expect(400); // another company's entity
      await dept({ name: 'Both', ownerLegalEntityId: ids.tn, appliesToEntities: [ids.kfpl] }).expect(400);
    });

    it('YX-ORG-05: names and codes are unique within their scope, not across scopes', async () => {
      await dept({ name: 'sales' }).expect(409); // shared: whole company
      await dept({ name: 'Other', code: 'sales' }).expect(409);
      await dept({ name: 'Sales', ownerLegalEntityId: ids.tn }).expect(201); // entity-only scope
      await dept({ name: 'Sales' }, 'adminB').expect(201); // another company
    });

    it('a shared master limited to some entities is offered only to them', async () => {
      const limited = (await dept({ name: 'Karnataka Field Force', appliesToEntities: [ids.kfpl] }).expect(201)).body.id;
      const forTn = (await api('adminA', 'get', `/masters/departments?legalEntityId=${ids.tn}`).expect(200)).body.map((d: { id: string }) => d.id);
      const forKfpl = (await api('adminA', 'get', `/masters/departments?legalEntityId=${ids.kfpl}`).expect(200)).body.map((d: { id: string }) => d.id);
      expect(forKfpl).toContain(limited);
      expect(forTn).not.toContain(limited);
      expect(forTn).toEqual(expect.arrayContaining([ids.prod, ids.packing, ids.ops]));
      expect(forKfpl).not.toContain(ids.packing);
    });

    it('YX-ORG-04: a parent with live children is not archived; a referenced department is never deleted', async () => {
      await api('adminA', 'post', `/masters/departments/${ids.quality}/archive`).expect(409);
      await api('adminA', 'delete', `/masters/departments/${ids.quality}`).expect(409);
      await api('adminA', 'post', `/masters/departments/${ids.lab}/archive`).expect(200);
      await api('adminA', 'post', `/masters/departments/${ids.quality}/archive`).expect(200);
      await dept({ name: 'Under archived', parentId: ids.quality }).expect(400);
      await api('adminA', 'post', `/masters/departments/${ids.lab}/restore`).expect(409); // its parent is archived
      await api('adminA', 'post', `/masters/departments/${ids.quality}/restore`).expect(200);
      await api('adminA', 'post', `/masters/departments/${ids.lab}/restore`).expect(200);
      const temp = (await dept({ name: 'Temporary' }).expect(201)).body.id;
      await api('adminA', 'delete', `/masters/departments/${temp}`).expect(204);
      expect((await auditActions(org.A.id, 'org.department.')).map((a) => a.action)).toEqual(expect.arrayContaining(['org.department.created', 'org.department.updated', 'org.department.archived', 'org.department.restored', 'org.department.deleted']));
    });

    it("another company's departments cannot be read, parented or changed", async () => {
      expect((await api('adminB', 'get', '/masters/departments').expect(200)).body.map((d: { id: string }) => d.id)).not.toContain(ids.ops);
      await dept({ name: 'Stray', parentId: ids.ops }, 'adminB').expect(400);
      await api('adminB', 'put', `/masters/departments/${ids.ops}`).send({ name: 'Mine now' }).expect(404);
      await api('adminB', 'post', `/masters/departments/${ids.ops}/archive`).expect(404);
    });
  });

  describe('designations, grades, employment types and cost centres', () => {
    it('validates each kind', async () => {
      await api('adminA', 'post', '/masters/designations').send({ name: 'Quality Analyst', jobFamily: 'Quality' }).expect(201);
      await api('adminA', 'post', '/masters/grades').send({ name: 'G1 · Associate', code: 'G1', rank: 0 }).expect(400);
      ids.g1 = (await api('adminA', 'post', '/masters/grades').send({ name: 'G1 · Associate', code: 'G1', rank: 3 }).expect(201)).body.id;
      ids.gTn = (await api('adminA', 'post', '/masters/grades').send({ name: 'W1 · Plant worker', code: 'W1', rank: 1, ownerLegalEntityId: ids.tn }).expect(201)).body.id;
      await api('adminA', 'post', '/masters/employment-types').send({ name: 'Intern', category: 'volunteer' }).expect(400);
      const type = await api('adminA', 'post', '/masters/employment-types').send({ name: 'Graduate apprentice', category: 'apprentice' }).expect(201);
      expect(type.body).toMatchObject({ code: 'GRADUATE-APPRENTICE', category: 'apprentice' });
    });

    it('cost centres: per entity, parent in the same entity, no cycles; codes unique per entity', async () => {
      const cc = (body: object) => api('adminA', 'post', '/masters/cost-centres').send(body);
      ids.ccPrd = (await cc({ legalEntityId: ids.tn, name: 'Hosur production', code: 'CC-PRD' }).expect(201)).body.id;
      ids.ccQa = (await cc({ legalEntityId: ids.tn, name: 'Hosur quality', code: 'CC-QA', parentId: ids.ccPrd }).expect(201)).body.id;
      await cc({ legalEntityId: ids.kfpl, name: 'Bengaluru production', code: 'CC-PRD' }).expect(201); // same code, other entity
      await cc({ legalEntityId: ids.tn, name: 'Copy', code: 'cc-prd' }).expect(409);
      await cc({ legalEntityId: ids.kfpl, name: 'Cross', parentId: ids.ccPrd }).expect(400);
      await api('adminA', 'put', `/masters/cost-centres/${ids.ccPrd}`).send({ legalEntityId: ids.tn, name: 'Hosur production', parentId: ids.ccQa }).expect(400);
      await api('adminA', 'put', `/masters/cost-centres/${ids.ccPrd}`).send({ legalEntityId: ids.kfpl, name: 'Hosur production' }).expect(400);
      await api('adminA', 'post', `/masters/cost-centres/${ids.ccPrd}/archive`).expect(409);
    });

    it('an unknown master kind is a 400', async () => {
      await api('adminA', 'get', '/masters/salaries').expect(400);
    });
  });

  describe('grade pay ranges: pay is private (R1) and dated (P06)', () => {
    const range = (over: object = {}) => ({ legalEntityId: ids.kfpl, min: 240000, mid: 300000, max: 360000, validFrom: past, ...over });
    const ranges = async () => ((await api('payrollA', 'get', `/grades/${ids.g1}/pay-ranges?legalEntityId=${ids.kfpl}`).expect(200)).body as { id: string; currency: string; min: string; validFrom: string; validTo: string | null }[]).filter((r) => r.currency === 'INR');

    it('nobody without pay access sees or changes a range: not the System Admin, not the auditor', async () => {
      for (const who of ['adminA', 'auditorA', 'panelA'] as const) {
        await api(who, 'get', `/grades/${ids.g1}/pay-ranges`).expect(403);
        await api(who, 'post', `/grades/${ids.g1}/pay-ranges`).send(range()).expect(403);
      }
      // Grade lists never carry amounts.
      const grades = JSON.stringify((await api('adminA', 'get', '/masters/grades').expect(200)).body);
      expect(grades).not.toMatch(/min|max|300000/);
    });

    it('a change needs step-up; amounts must be ordered; the grade must be available to the entity', async () => {
      const { sid } = new JwtService({}).decode(token.payrollA) as { sid: string };
      await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { assuranceLevel: 'aal1', mfaVerifiedAt: null, mfaMethod: null } }));
      const refused = await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range()).expect(403);
      expect(refused.body.code).toBe(STEP_UP_REQUIRED_CODE);
      await markSteppedUp(tenantPrisma, token.payrollA);
      ids.r1 = (await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range()).expect(201)).body.id;
      await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range({ min: 400000, validFrom: future })).expect(400);
      await api('payrollA', 'post', `/grades/${ids.gTn}/pay-ranges`).send(range()).expect(400); // TN-only grade
      await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range({ legalEntityId: ids.bEntity })).expect(400);
    });

    it('P06 §4.3: a future range closes the open one the day before; the past is never cut (YX-HIS-07)', async () => {
      await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range({ validFrom: addDays(today, -10) })).expect(409);
      const next = await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range({ min: 260000, mid: 320000, max: 380000, validFrom: future })).expect(201);
      ids.r2 = next.body.id;
      expect(await ranges()).toEqual([
        expect.objectContaining({ id: ids.r1, min: '240000', validFrom: past, validTo: addDays(future, -1) }),
        expect.objectContaining({ id: ids.r2, min: '260000', validFrom: future, validTo: null }),
      ]);
    });

    it('YX-HIS-02: overlapping ranges are refused (also by the database)', async () => {
      await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range({ validFrom: addDays(past, 10), validTo: addDays(past, 20) })).expect(409);
      await expect(
        tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) =>
          tx.gradePayRange.create({ data: { organizationId: org.A.id, gradeId: ids.g1, legalEntityId: ids.kfpl, currency: 'INR', min: 1, mid: 1, max: 1, validFrom: new Date(`${past}T00:00:00Z`) } }),
        ),
      ).rejects.toThrow(/exclusion constraint|no_overlap/);
      // Another currency is its own series.
      await api('payrollA', 'post', `/grades/${ids.g1}/pay-ranges`).send(range({ currency: 'USD', min: 3000, mid: 4000, max: 5000 })).expect(201);
    });

    it('a future-dated range can be edited or withdrawn (the previous one runs on); one in force cannot', async () => {
      await api('payrollA', 'put', `/pay-ranges/${ids.r1}`).send({ min: 1, mid: 2, max: 3 }).expect(409);
      await api('payrollA', 'delete', `/pay-ranges/${ids.r1}`).expect(409);
      const edited = await api('payrollA', 'put', `/pay-ranges/${ids.r2}`).send({ min: 270000, mid: 330000, max: 390000 }).expect(200);
      expect(edited.body.min).toBe('270000');
      await api('payrollA', 'delete', `/pay-ranges/${ids.r2}`).expect(204);
      expect(await ranges()).toEqual([expect.objectContaining({ id: ids.r1, validTo: null })]);
    });

    it('every look at pay is recorded; another company sees nothing', async () => {
      const trail = await auditActions(org.A.id, 'org.pay_range.');
      expect(trail.filter((a) => a.action === 'org.pay_range.viewed').length).toBeGreaterThanOrEqual(2);
      expect(trail.map((a) => a.action)).toEqual(expect.arrayContaining(['org.pay_range.created', 'org.pay_range.updated', 'org.pay_range.deleted']));
      await api('adminB', 'get', `/grades/${ids.g1}/pay-ranges`).expect(403);
    });
  });

  describe('scoped settings (P01 §4.6; YX-ORG-12, YX-ORG-18)', () => {
    const set = (body: object, who: Who = 'adminA') => api(who, 'put', '/settings').send(body);

    it('only registered keys, allowed scopes and values; dated keys need a start date', async () => {
      await set({ key: 'payroll.secret_bonus', scopeType: 'tenant', value: 'x' }).expect(400);
      await set({ key: 'employee_code.scope', scopeType: 'legal_entity', scopeId: ids.kfpl, value: 'tenant' }).expect(400);
      await set({ key: 'employee_code.scope', scopeType: 'tenant', value: 'everywhere' }).expect(400);
      await set({ key: 'attendance.mode', scopeType: 'tenant', value: 'punch' }).expect(400);
      await set({ key: 'employee_code.scope', scopeType: 'tenant', value: 'tenant', validFrom: today }).expect(400);
      await set({ key: 'attendance.mode', scopeType: 'location', scopeId: ids.blr, value: 'punch', validFrom: past }, 'adminB').expect(404);
      await set({ key: 'attendance.mode', scopeType: 'employee', scopeId: users.adminA, value: 'punch', validFrom: past }).expect(400);
      await set({ key: 'employee_code.scope', scopeType: 'tenant', value: 'tenant' }).expect(200);
    });

    it('resolves most-specific first and says where the value comes from; a site brings its entity', async () => {
      await set({ key: 'attendance.mode', scopeType: 'tenant', value: 'timesheet', validFrom: past }).expect(200);
      await set({ key: 'attendance.mode', scopeType: 'legal_entity', scopeId: ids.tn, value: 'assumed_present', validFrom: past }).expect(200);
      const loc = await set({ key: 'attendance.mode', scopeType: 'location', scopeId: ids.hosur, value: 'punch', validFrom: past }).expect(200);
      ids.hosurSetting = loc.body.id;
      const resolve = (q: string) => api('adminA', 'get', `/settings/resolve?key=attendance.mode&asOf=${today}${q}`).expect(200);
      expect((await resolve(`&locationId=${ids.hosur}`)).body).toMatchObject({ value: 'punch', source: { scopeType: 'location', scopeId: ids.hosur } });
      expect((await resolve(`&legalEntityId=${ids.tn}`)).body).toMatchObject({ value: 'assumed_present', source: { scopeType: 'legal_entity' } });
      expect((await resolve(`&locationId=${ids.blr}`)).body).toMatchObject({ value: 'timesheet', source: { scopeType: 'tenant' } });
      expect((await resolve(`&locationId=${ids.hosur}&departmentId=${ids.quality}`)).body.source.scopeType).toBe('location');
      await api('adminA', 'get', `/settings/resolve?key=attendance.mode&asOf=${today}&locationId=${ids.hosur}&legalEntityId=${ids.kfpl}`).expect(400);
      expect((await api('adminA', 'get', '/settings/resolve?key=employee_code.scope').expect(200)).body).toMatchObject({ value: 'tenant', source: { scopeType: 'tenant' } });
      expect((await api('adminB', 'get', '/settings/resolve?key=employee_code.scope').expect(200)).body).toMatchObject({ value: 'legal_entity', source: { scopeType: 'default' } });
    });

    it('YX-ORG-18: a dated key is resolved as of the date processed, never silently as of today', async () => {
      await api('adminA', 'get', '/settings/resolve?key=attendance.mode').expect(400);
      const later = await set({ key: 'attendance.mode', scopeType: 'location', scopeId: ids.hosur, value: 'timesheet', validFrom: future }).expect(200);
      const at = (d: string) => api('adminA', 'get', `/settings/resolve?key=attendance.mode&asOf=${d}&locationId=${ids.hosur}`).expect(200);
      expect((await at(today)).body.value).toBe('punch');
      expect((await at(future)).body).toMatchObject({ value: 'timesheet', source: { validFrom: future } });
      expect((await at(addDays(past, -1))).body.source.scopeType).toBe('default');

      // Future-dated values may change or go; values in force stay (YX-HIS-07).
      await set({ key: 'attendance.mode', scopeType: 'location', scopeId: ids.hosur, value: 'assumed_present', validFrom: future }).expect(200);
      await set({ key: 'attendance.mode', scopeType: 'location', scopeId: ids.hosur, value: 'timesheet', validFrom: past }).expect(409);
      await api('adminA', 'delete', `/settings/${ids.hosurSetting}`).expect(409);
      await api('adminA', 'delete', `/settings/${later.body.id}`).expect(204);
      await api('adminB', 'delete', `/settings/${ids.hosurSetting}`).expect(404);
    });

    it('a record with settings counts as used: it can be archived, not deleted (YX-ORG-04)', async () => {
      await api('adminA', 'delete', `/locations/${ids.hosur}`).expect(409);
      expect((await auditActions(org.A.id, 'org.setting.')).map((a) => a.action)).toEqual(expect.arrayContaining(['org.setting.changed', 'org.setting.removed']));
      const list = (await api('auditorA', 'get', '/settings').expect(200)).body;
      expect(Object.keys(list.registry)).toEqual(expect.arrayContaining(['attendance.mode', 'employee_code.scope']));
      expect(list.overrides.every((o: { scopeId: string }) => o.scopeId !== org.B.id)).toBe(true);
    });
  });

  it('reference lists: India states and the open regions', async () => {
    const ref = (await api('auditorA', 'get', '/reference').expect(200)).body;
    expect(ref.states).toEqual(expect.arrayContaining([{ code: 'IN-KA', name: 'Karnataka', country: 'IN' }]));
    expect(ref.regions).toEqual([{ code: 'IN', countries: ['IN'] }]);
  });
});
