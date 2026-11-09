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
import { ROLE_TEMPLATES } from '../src/access/role-templates';

// Settings 6.1 Hiring end to end against the real database (forced RLS, the app role): recruiting and hiring admins
// read it; the hiring settings key (or HR's settings key) for the whole company changes it; a grant for one legal entity
// confers nothing; employees are refused; another company sees only its own values and cannot name this company's
// people; acting for someone else is refused; bad values save nothing; every change is audited with before and after.
// The stage targets (founder answer 302) are a pipeline write with the pipelines key.
describe('Settings 6.1 Hiring', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let billingPlanId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'rec' | 'hra' | 'mgr' | 'emp' | 'hrEntity' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = (o: string) => <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => at(org.A.id)(fn);
  const save = (who: Who, changes: unknown) => api(who, 'put', '/hiring/settings').send({ changes });
  type Settings = { canEdit: boolean; values: Record<string, string>; people: { id: string; name: string }[]; lastChange: { by: string; what: string } | null; pipelines: { id: string; name: string; stages: { id: string; name: string; daysTarget: number | null; limit: number | null }[] }[] };
  const read = async (who: Who) => (await api(who, 'get', '/hiring/settings').expect(200)).body as Settings;

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

    billingPlanId = (await prisma.plan.create({ data: { name: `hirset-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIRSET Org ${k}`, slug: `hirset-${k.toLowerCase()}-${run}`, planId: billingPlanId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['rec', 'A', 'panel', tpl('recruiter')],
      ['hra', 'A', 'panel', tpl('hiring_admin')],
      ['mgr', 'A', 'panel', tpl('hiring_manager')],
      ['emp', 'A', 'panel', []],
      ['hrEntity', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await at(o)((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at(o)((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hirset-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    // hrEntity: HR's settings key and the hiring settings key granted for one legal entity only (confers nothing here).
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods', shortName: `KF-${run}`, isDefault: true } })).id;
      const profile = await tx.permissionProfile.create({ data: { ...o, name: `entity-${run}`, permissionsJson: JSON.stringify(['org.settings.manage', 'ats.settings.manage']) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.hrEntity, permissionProfileId: profile.id, scopeType: 'legal_entity', legalEntityId: ids.entity, validFrom: new Date('2026-01-01'), status: 'active', reason: 'HR for Kaveri Foods' } });
    });
    for (const [who, k] of [['adminA', 'A'], ['adminB', 'B'], ['rec', 'A'], ['hra', 'A'], ['mgr', 'A'], ['emp', 'A'], ['hrEntity', 'A']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hirset-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.hra}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    // The company's first job makes its standard pipeline.
    await request(server()).post('/api/v1/jobs').set('Authorization', `Bearer ${token.adminA}`).send({ title: 'Plant Technician', location: 'Hosur' }).expect(201);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: billingPlanId } }).catch(() => undefined);
    await app.close();
  });

  it('reads: recruiting and hiring admins see the defaults; only the settings keys may edit; employees and managers are refused', async () => {
    const rec = await read('rec');
    expect(rec).toMatchObject({ canEdit: false, values: { 'ats.retention_months': '12', 'hiring.reject.email_candidate': 'off', 'ats.referral.bonus_inr': '25000', 'ats.referral.qualify_days': '90', 'hiring.requisition.default_recruiter': 'none' }, lastChange: null });
    expect(rec.people.map((p) => p.id)).toEqual(expect.arrayContaining([users.rec, users.hra]));
    expect(rec.pipelines[0]!.stages.length).toBeGreaterThan(2);
    expect((await read('hra')).canEdit).toBe(true);
    expect((await read('adminA')).canEdit).toBe(true);
    // A grant for one legal entity reads but never edits (company settings are company-wide).
    expect((await read('hrEntity')).canEdit).toBe(false);
    await api('emp', 'get', '/hiring/settings').expect(403);
    await api('mgr', 'get', '/hiring/settings').expect(403);
  });

  it('the hiring settings key changes several at once; each change is audited with before and after', async () => {
    const after = (await save('hra', [
      { key: 'ats.retention_months', value: '18' },
      { key: 'hiring.reject.email_candidate', value: 'on' },
      { key: 'ats.referral.bonus_inr', value: '50000' },
      { key: 'ats.referral.qualify_days', value: '60' },
      { key: 'hiring.requisition.default_recruiter', value: users.rec },
    ]).expect(200)).body as Settings;
    expect(after.values).toEqual({ 'ats.retention_months': '18', 'hiring.reject.email_candidate': 'on', 'ats.referral.bonus_inr': '50000', 'ats.referral.qualify_days': '60', 'hiring.requisition.default_recruiter': users.rec });
    expect(after.lastChange).toMatchObject({ by: `hra ${run}` });
    // The other screens read the same company settings.
    expect((await api('rec', 'get', '/referrals/policy').expect(200)).body).toMatchObject({ bonusInr: 50000, qualifyDays: 60 });
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'org.setting.changed' }, orderBy: { createdAt: 'asc' } }));
    expect(audits.map((a) => JSON.parse(a.metadataJson!))).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'ats.retention_months', from: null, to: '18' }), expect.objectContaining({ key: 'hiring.requisition.default_recruiter', from: null, to: users.rec })]));
    expect(audits.every((a) => a.actorUserId === users.hra)).toBe(true);
    // A second change records the value before.
    await save('adminA', [{ key: 'ats.retention_months', value: '24' }]).expect(200);
    const last = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'org.setting.changed' }, orderBy: { createdAt: 'desc' } }));
    expect(JSON.parse(last.metadataJson!)).toMatchObject({ key: 'ats.retention_months', from: '18', to: '24' });
  });

  it('without the key (recruiter, manager, employee, one legal entity only) a change is refused (403); acting for someone else too', async () => {
    const one = [{ key: 'ats.retention_months', value: '6' }];
    for (const who of ['rec', 'mgr', 'emp', 'hrEntity'] as const) await save(who, one).expect(403);
    // Impersonation never changes settings (refused by the key check or, with the key, as acting for someone else).
    await save('acting', one).expect(403);
    expect((await read('rec')).values['ats.retention_months']).toBe('24');
  });

  it('bad values and keys save nothing (400)', async () => {
    const bad: unknown[] = [
      [{ key: 'ats.retention_months', value: '7' }],
      [{ key: 'ats.retention_months', value: '6' }, { key: 'ats.referral.bonus_inr', value: '12345' }],
      [{ key: 'hiring.reject.email_candidate', value: 'yes' }],
      [{ key: 'ats.headcount_plan', value: 'off' }], // a setting that is not on this page
      [{ key: 'not.a.setting', value: 'x' }],
      [{ key: 'ats.retention_months', value: '6' }, { key: 'ats.retention_months', value: '9' }],
      [{ key: 'ats.retention_months', value: 6 }],
      [{ key: 'ats.retention_months', value: '6', extra: true }],
      [{ key: 'BAD KEY', value: '6' }],
      [],
    ];
    for (const changes of bad) await save('hra', changes).expect(400);
    await api('hra', 'put', '/hiring/settings').send({}).expect(400);
    expect((await read('rec')).values).toMatchObject({ 'ats.retention_months': '24', 'ats.referral.bonus_inr': '50000' });
  });

  it('another company: its own values only; this company\'s people are not found (404); a person who left cannot be chosen', async () => {
    const b = await read('adminB');
    expect(b.values).toMatchObject({ 'ats.retention_months': '12', 'hiring.requisition.default_recruiter': 'none' });
    expect(b.people.map((p) => p.id)).not.toContain(users.rec);
    await save('adminB', [{ key: 'hiring.requisition.default_recruiter', value: users.rec }]).expect(404);
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: users.adminB }]).expect(404);
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: randomUUID() }]).expect(404);
    await inA((tx) => tx.user.update({ where: { id: users.emp }, data: { status: 'inactive' } }));
    await save('hra', [{ key: 'hiring.requisition.default_recruiter', value: users.emp }]).expect(404);
    expect((await read('rec')).values['hiring.requisition.default_recruiter']).toBe(users.rec);
  });

  it('stage targets (answer 302): the pipelines key changes them, audited; the hiring admin alone may not; another company gets 404', async () => {
    const stage = (await read('rec')).pipelines[0]!.stages[1]!;
    const patch = (who: Who, body: object, id = stage.id) => api(who, 'patch', `/pipelines/stages/${id}`).send(body);
    await patch('hra', { daysTarget: 5 }).expect(403);
    await patch('acting', { daysTarget: 5 }).expect(403);
    await patch('adminB', { daysTarget: 5 }).expect(404);
    await patch('adminA', { daysTarget: 0 }).expect(400);
    await patch('adminA', { limit: 1001 }).expect(400);
    await patch('rec', { daysTarget: 5, limit: 12 }).expect(200);
    expect((await read('hra')).pipelines[0]!.stages[1]).toMatchObject({ id: stage.id, daysTarget: 5, limit: 12 });
    await patch('rec', { daysTarget: null, limit: null }).expect(200);
    expect((await read('hra')).pipelines[0]!.stages[1]).toMatchObject({ daysTarget: null, limit: null });
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'pipeline.stage_updated', entityId: stage.id } }))).toBe(2);
  });
});
