import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';
import { StatutoryRulesService } from '../src/statutory/statutory.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Batch H: state payroll rules as dated rule data (docs/yukthix/reference/statutory/india-state-rules-2026-27.md §7).
// Every new set is verify (a CA checks it before go-live). Positive and negative paths per item.
describe('Payroll: state statutory rules (batch H)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'payAdmin' | 'emp1' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const addPlace = (state: string, code: string) =>
    inA(async (tx) => (await tx.location.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, name: `${state} office`, code, address: {}, country: 'IN', state, timezone: 'Asia/Kolkata' } })).id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    // The side packs load through the console's two-person flow (as the seed does); sets already there are skipped.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, [...pack('in-dues.json'), ...pack('in-tax.json')], await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    (moduleRef.get(StatutoryRulesService) as unknown as { cache: null }).cache = null;
    planId = (await prisma.plan.create({ data: { name: `payst-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PaySt Org ${k}`, slug: `payst-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const template = (key: string) => ROLE_TEMPLATES.find((t) => t.key === key)!.permissions;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['payAdmin', 'A', 'panel', template('payroll_admin')],
      ['emp1', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys
        ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id
        : null;
      users[who] = (
        await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: o, email: `${who}@payst-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@payst-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.entity = (await inA((tx) => tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'PaySt Traders', shortName: `PST-${run}`, isDefault: true } }))).id;
    await addPlace('IN-KA', 'BLR');
    await addPlace('IN-HR', 'GGN');
  }, 300_000);

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

  const rulesOf = async (statute: string, jurisdiction: string) =>
    ((await api('payAdmin', 'get', `/payroll/statutory/rules?entityId=${ids.entity}`).expect(200)).body as { statute: string; jurisdiction: string; version: string; validFrom: string; validTo: string | null; verify: boolean; source: string; values: Record<string, unknown> }[]).filter(
      (r) => r.statute === statute && r.jurisdiction === jurisdiction,
    );
  const missing = async () => ((await api('payAdmin', 'get', `/payroll/entities/${ids.entity}/statutory-registrations`).expect(200)).body as { completeness: { missing: string[] } }).completeness.missing;

  describe('H8: states with no professional tax', () => {
    it('Haryana has an explicit "none" set (verify, with its source); no PT registration is asked for there, but Karnataka still asks', async () => {
      const hr = await rulesOf('IN.PT', 'IN-HR');
      expect(hr).toEqual([expect.objectContaining({ version: '2025-v1', verify: true, values: expect.objectContaining({ slabs: [] }) })]);
      expect(hr[0].source).toMatch(/CA checklist item 23/);
      const m = await missing();
      expect(m).toContain('IN.PT IN-KA: say whether the entity is registered');
      expect(m.some((x) => x.startsWith('IN.PT IN-HR'))).toBe(false);
    });

    it('negatives: an employee is refused, another company sees nothing, a registration for a state with no place is a 400 and nothing is saved', async () => {
      await api('emp1', 'get', `/payroll/entities/${ids.entity}/statutory-registrations`).expect(403);
      await api('emp1', 'get', `/payroll/statutory/rules?entityId=${ids.entity}`).expect(403);
      await api('payAdminB', 'get', `/payroll/entities/${ids.entity}/statutory-registrations`).expect(404);
      await api('payAdminB', 'get', `/payroll/statutory/rules?entityId=${ids.entity}`).expect(404);
      await markSteppedUp(tenantPrisma, token.payAdmin);
      await api('payAdmin', 'put', `/payroll/entities/${ids.entity}/statutory-registrations`)
        .send({ registrations: [{ statute: 'IN.PT', state: 'IN-UP', status: 'off', responsiblePerson: 'Asha', responsibleDesignation: 'HR' }] })
        .expect(400);
      expect(await inA((tx) => tx.statutoryRegistration.count({ where: { legalEntityId: ids.entity } }))).toBe(0);
    });
  });
});
