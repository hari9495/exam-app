import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Settings S-3 (founder answers 1323 to 1325), against the real database. The payroll and tax settings that had no screen
// are listed with their starter values and legal limits; while "Payroll setting changes need a second person" is on (the
// default) a change waits for another person with HR's settings key, never the one who asked (service and database);
// approved, it applies and is audited with both people; rejected or withdrawn, nothing changes.
describe('Settings S-3: payroll settings and a second person (1323 to 1325)', () => {
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
    planId = (await prisma.plan.create({ data: { name: `s3-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slug = `s3-${run}`;
    orgId = (await prisma.organization.create({ data: { name: `S3 ${run}`, slug, planId } })).id;
    const people: [string, string[]][] = [
      ['hr1', ['org.settings.manage', 'org.structure.view', 'access.role.manage']],
      ['hr2', ['org.settings.manage', 'org.structure.view']],
      ['hr3', ['org.settings.manage', 'access.role.manage']],
      ['payroll', ['payroll.setup.manage', 'payroll.run.view']],
      ['plain', []],
    ];
    for (const [who, keys] of people) {
      const permissionProfileId = (await inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
      const email = `${who}-${run}@s3.test`;
      users[who] = (await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email, name: `Person ${who}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
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

  it('the payroll and tax settings are listed with their starter values and legal limits; payroll set-up reads them', async () => {
    const body = (await api('payroll', 'get', '/org/settings').expect(200)).body as { registry: Record<string, { default: string }>; limits: Record<string, unknown>; pending: unknown[] };
    for (const key of ['payroll.net_rounding', 'payroll.mid_period.cutoff_day', 'payroll.document_retention_years', 'tax.proof_cutoff', 'payroll.settings.second_person']) expect([key, typeof body.registry[key]?.default]).toEqual([key, 'string']);
    expect(body.registry['payroll.settings.second_person']!.default).toBe('on');
    expect(body.limits['payroll.document_retention_years']).toEqual({ min: 8, act: 'Companies Act, 2013 s.128(5)' });
    expect(body.limits['payroll.standard_daily_hours']).toEqual({ max: 9, act: 'Factories Act, 1948 s.54' });
    expect(body.pending).toEqual([]);
  });

  it('negative: payroll set-up and anyone else cannot change a payroll setting', async () => {
    await put('payroll', 'tax.proof_cutoff', '03-15').expect(403);
    await put('plain', 'tax.proof_cutoff', '03-15').expect(403);
    await api('plain', 'get', '/org/settings').expect(403);
  });

  let first = '';
  it('a change waits for a second person: nothing applies yet, one waits per setting, audited', async () => {
    const r = (await put('hr1', 'tax.proof_cutoff', '03-15').expect(200)).body;
    expect(r).toMatchObject({ pending: true, key: 'tax.proof_cutoff' });
    first = r.id;
    expect(await valueOf('tax.proof_cutoff')).toBeNull();
    expect((await put('hr2', 'tax.proof_cutoff', '01-31').expect(409)).body.message).toMatch(/already waiting for a second person/);
    const list = (await api('hr2', 'get', '/org/settings').expect(200)).body.pending as { id: string; key: string; to: string; by: string; mine: boolean }[];
    expect(list).toEqual([expect.objectContaining({ id: first, key: 'tax.proof_cutoff', to: '03-15', by: 'Person hr1', mine: false })]);
    expect(((await api('hr1', 'get', '/org/settings').expect(200)).body.pending as { mine: boolean }[])[0]!.mine).toBe(true);
    expect(await audits('org.setting.change_requested')).toEqual([{ actor: users.hr1, meta: expect.objectContaining({ key: 'tax.proof_cutoff', from: null, to: '03-15' }) }]);
  });

  it('the person who asked never approves it, nor does someone without the key; another HR person does, audited with both', async () => {
    expect((await api('hr1', 'post', `/org/settings/requests/${first}/approve`).send({}).expect(403)).body.message).toMatch(/another person/);
    await api('payroll', 'post', `/org/settings/requests/${first}/approve`).send({}).expect(403);
    await api('hr2', 'post', `/org/settings/requests/${first}/approve`).send({}).expect(200);
    expect(await valueOf('tax.proof_cutoff')).toBe('03-15');
    await api('hr2', 'post', `/org/settings/requests/${first}/approve`).send({}).expect(404);
    const changed = (await audits('org.setting.changed')).find((a) => a.meta.key === 'tax.proof_cutoff');
    expect(changed).toMatchObject({ actor: users.hr2, meta: expect.objectContaining({ from: null, to: '03-15', requestedBy: users.hr1, approvedBy: users.hr2, requestId: first }) });
    expect(await audits('org.setting.change_approved')).toEqual([{ actor: users.hr2, meta: expect.objectContaining({ key: 'tax.proof_cutoff', requestedBy: users.hr1 }) }]);
  });

  it('rejected or withdrawn, nothing changes; both are audited', async () => {
    const a = (await put('hr1', 'payroll.net_rounding', 'none').expect(200)).body.id as string;
    await api('hr2', 'post', `/org/settings/requests/${a}/reject`).send({ note: 'We keep rupee rounding' }).expect(204);
    const b = (await put('hr2', 'payroll.mid_period.cutoff_day', '20').expect(200)).body.id as string;
    await api('hr2', 'post', `/org/settings/requests/${b}/reject`).send({}).expect(204);
    expect(await valueOf('payroll.net_rounding')).toBeNull();
    expect(await valueOf('payroll.mid_period.cutoff_day')).toBeNull();
    const rejected = await audits('org.setting.change_rejected');
    expect(rejected).toEqual(
      expect.arrayContaining([
        { actor: users.hr2, meta: expect.objectContaining({ key: 'payroll.net_rounding', withdrawn: false, note: 'We keep rupee rounding' }) },
        { actor: users.hr2, meta: expect.objectContaining({ key: 'payroll.mid_period.cutoff_day', withdrawn: true }) },
      ]),
    );
    await api('hr1', 'post', `/org/settings/requests/${a}/approve`).send({}).expect(404);
  });

  it('the database never lets the person who asked approve their own change', async () => {
    const c = (await put('hr1', 'payroll.payslip_email', 'on').expect(200)).body.id as string;
    await expect(inOrg((tx) => tx.settingChangeRequest.update({ where: { id: c }, data: { status: 'approved', decidedBy: users.hr1, decidedAt: new Date() } }))).rejects.toThrow(/setting_change_requests_four_eyes/);
    await api('hr2', 'post', `/org/settings/requests/${c}/reject`).send({}).expect(204);
  });

  it('other settings save at once; turning the switch off needs the access key and a second person; then payroll changes save at once', async () => {
    await put('hr1', 'leave.send_back', 'off').expect(200);
    expect(await valueOf('leave.send_back')).toBe('off');
    await put('hr2', 'payroll.settings.second_person', 'off').expect(403); // the access key too
    const off = (await put('hr1', 'payroll.settings.second_person', 'off').expect(200)).body;
    expect(off.pending).toBe(true);
    await api('hr2', 'post', `/org/settings/requests/${off.id}/approve`).send({}).expect(403); // the approver needs it as well
    await api('hr3', 'post', `/org/settings/requests/${off.id}/approve`).send({}).expect(200);
    expect(await valueOf('payroll.settings.second_person')).toBe('off');
    const now = (await put('hr2', 'payroll.net_rounding', 'none').expect(200)).body;
    expect(now.pending).toBeUndefined();
    expect(await valueOf('payroll.net_rounding')).toBe('none');
  });

  it('another company never sees or decides these changes', async () => {
    const rows = await tenantPrisma.forTenant({ organizationId: randomUUID(), isSuperAdmin: false }, (tx) => tx.settingChangeRequest.findMany({ where: { organizationId: orgId } }));
    expect(rows).toEqual([]);
  });
});
