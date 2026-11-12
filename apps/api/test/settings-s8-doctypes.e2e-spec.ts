import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Settings S-8, 5.1 Document types (answer 1331), against the real database: HR's settings key adds and changes the
// company's own document types (sensitivity, HR verifies, expiry reminders, who uploads); YukthiX's starter types cannot
// be changed or removed; a type no document uses can be retired; another company never sees them.
describe('Settings S-8: document types (5.1)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  let orgId = '';
  let planId = '';
  let otherOrg = '';
  const api = (who: string, method: 'get' | 'put' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant' });
  const inOrg = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);
  const valueOf = async (key: string) => (await inOrg((tx) => tx.setting.findFirst({ where: { organizationId: orgId, key, scopeType: 'tenant' } })))?.value ?? null;
  const audits = (action: string) => inOrg(async (tx) => (await tx.auditLog.findMany({ where: { organizationId: orgId, action } })).map((a) => ({ actor: a.actorUserId, meta: JSON.parse(a.metadataJson ?? '{}') as Record<string, unknown> })));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s8d-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slug = `s8d-${run}`;
    orgId = (await prisma.organization.create({ data: { name: `S8D ${run}`, slug, planId } })).id;
    const people: [string, string[]][] = [
      ['hr1', ['org.settings.manage', 'org.structure.view', 'access.role.manage']],
      ['hr2', ['org.settings.manage', 'org.structure.view']],
      ['hr3', ['org.settings.manage', 'access.role.manage']],
      ['exp', ['expense.policy.manage']],
      ['expview', ['expense.policy.view']],
      ['perf', ['perf.setup.manage']],
      ['plain', []],
    ];
    for (const [who, keys] of people) {
      const permissionProfileId = (await inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
      const email = `${who}-${run}@s8d.test`;
      users[who] = (await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email, name: `Person ${who}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.organization.deleteMany({ where: { id: otherOrg } });
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
        await tx.organization.deleteMany({ where: { id: orgId } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  type T = { key: string; name: string; sensitivity: string; requiresVerification: boolean; expiryTracked: boolean; reminderDays: number[]; uploadBy: string[]; system: boolean };
  const types = async (who = 'hr2') => (await api(who, 'get', '/documents/types').expect(200)).body as T[];
  const FSSAI = { name: 'FSSAI food handler certificate', sensitivity: 'internal', requiresVerification: true, expiryTracked: true, reminderDays: [30], uploadBy: ['hr'] };
  let key = '';

  it('the starter types are listed as YukthiX starters, with their reminder days', async () => {
    const list = await types();
    expect(list.find((t) => t.key === 'passport')).toMatchObject({ system: true, expiryTracked: true, reminderDays: [60, 30, 7] });
    expect(list.filter((t) => !t.system)).toEqual([]);
  });

  it('HR adds a company type, listed as its own and audited', async () => {
    key = ((await api('hr2', 'post', '/documents/types').send(FSSAI).expect(201)).body as { key: string }).key;
    expect(key).toBe('c_fssai_food_handler_certificate');
    expect((await types('plain')).find((t) => t.key === key)).toMatchObject({ ...FSSAI, system: false });
    expect((await audits('document.type.created'))[0]).toMatchObject({ actor: users.hr2, meta: expect.objectContaining({ key, reminderDays: [30] }) });
  });

  it('negative: no settings key, a name taken (a starter one too), reminders not offered, HR not uploading, or markup are refused', async () => {
    await api('plain', 'post', '/documents/types').send({ ...FSSAI, name: 'Gate pass' }).expect(403);
    expect((await api('hr2', 'post', '/documents/types').send({ ...FSSAI, name: 'passport' }).expect(409)).body.message).toMatch(/already exists/);
    await api('hr2', 'post', '/documents/types').send(FSSAI).expect(409);
    expect((await api('hr2', 'post', '/documents/types').send({ ...FSSAI, name: 'Gate pass', reminderDays: [45] }).expect(400)).body.message).toMatch(/offered days/);
    await api('hr2', 'post', '/documents/types').send({ ...FSSAI, name: 'Gate pass', uploadBy: ['person'] }).expect(400);
    await api('hr2', 'post', '/documents/types').send({ ...FSSAI, name: '<b>Gate</b>' }).expect(400);
    await api('hr2', 'post', '/documents/types').send({ ...FSSAI, name: 'Gate pass', sensitivity: 'special' }).expect(400);
    expect((await types()).filter((t) => !t.system).map((t) => t.key)).toEqual([key]);
  });

  it('HR changes its own type (audited with before and after); negative: a starter type cannot be changed or retired', async () => {
    await api('hr2', 'put', `/documents/types/${key}`).send({ ...FSSAI, reminderDays: [60, 30, 7], uploadBy: ['person', 'hr'] }).expect(200);
    expect((await types()).find((t) => t.key === key)).toMatchObject({ reminderDays: [60, 30, 7], uploadBy: ['person', 'hr'] });
    expect((await audits('document.type.changed'))[0]!.meta).toMatchObject({ key, before: { reminderDays: [30] }, after: { reminderDays: [60, 30, 7] } });
    expect((await api('hr2', 'put', '/documents/types/passport').send({ ...FSSAI, name: 'Passport' }).expect(403)).body.message).toMatch(/starter types cannot be changed/);
    await api('hr2', 'post', '/documents/types/passport/retire').expect(403);
    expect((await types()).find((t) => t.key === 'passport')).toMatchObject({ reminderDays: [60, 30, 7], system: true });
  });

  it('a type no document uses is retired and leaves the list; negative: one in use stays', async () => {
    const spare = ((await api('hr2', 'post', '/documents/types').send({ ...FSSAI, name: 'Gate pass', expiryTracked: false, reminderDays: [] }).expect(201)).body as { key: string }).key;
    const person = await inOrg((tx) => tx.person.create({ data: { organizationId: orgId, givenName: 'Ravi' } }));
    await inOrg((tx) => tx.document.create({ data: { organizationId: orgId, personId: person.id, typeKey: key, status: 'requested' } }));
    expect((await api('hr2', 'post', `/documents/types/${key}/retire`).expect(409)).body.message).toMatch(/1 document uses this type/);
    await api('hr2', 'post', `/documents/types/${spare}/retire`).expect(204);
    expect((await types()).map((t) => t.key)).toEqual(expect.arrayContaining([key]));
    expect((await types()).map((t) => t.key)).not.toContain(spare);
    await api('hr2', 'put', `/documents/types/${spare}`).send(FSSAI).expect(404);
  });

  it('another company never sees the company types (RLS), and cannot write a starter row', async () => {
    otherOrg = (await prisma.organization.create({ data: { name: `S8D other ${run}`, slug: `s8d-o-${run}`, planId } })).id;
    const seen = await tenantPrisma.forTenant({ organizationId: otherOrg, isSuperAdmin: false }, (tx) => tx.documentType.findMany({ where: { key } }));
    expect(seen).toEqual([]);
    await expect(inOrg((tx) => tx.documentType.updateMany({ where: { key: 'passport', organizationId: null }, data: { reminderDays: [1] } }))).resolves.toEqual({ count: 0 });
  });
});
