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
import { gstinCheckChar } from '../src/expenses/checks';
import { ROLE_TEMPLATES } from '../src/access/role-templates';

// Staffing desk slice 1 end to end (HIR-14 clients, HIR-15 rate cards, Settings 6.2): the desk is off until the company
// turns it on; account managers keep clients, contacts and dated rate cards with pay rates; recruiters read clients
// and bill rates only; money is exact paise; invoice series are one per GSTIN and year and never go back. Another
// company gets 404, an employee 403, acting for someone else 403, bad input 400, a stale or duplicate write 409.

jest.setTimeout(240_000);

describe('Staffing desk slice 1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'am' | 'rec' | 'recOld' | 'hr' | 'emp' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const gstin = (first14: string) => first14 + gstinCheckChar(first14);
  const TN = gstin('33AAFCN4521K1Z');
  const KA = gstin('29AABCC7788M1Z');
  const OURS = gstin('29AABCK1234F1Z');
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const client = (over: Record<string, unknown> = {}) => ({ name: `Nilgiri Retail ${run}`, legalName: 'Nilgiri Retail Pvt Ltd', gstin: TN, state: 'IN-TN', billingAddress: '14 Anna Salai, Chennai 600002', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31', noticeDays: 30, slaFirstSubmissionDays: 3, slaFeedbackDays: 2, ...over });
  const settings = (who: Who, changes: { key: string; value: string }[]) => api(who, 'put', '/staffing/settings').send({ changes });

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

    planId = (await prisma.plan.create({ data: { name: `staff1-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `STAFF1 Org ${k}`, slug: `staff1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['am', 'A', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      // Answer 452: a recruiter on the Recruiter template's keys, and one on the older recruiter role (no company role).
      ['rec', 'A', 'panel', [...ROLE_TEMPLATES.find((t) => t.key === 'recruiter')!.permissions]],
      ['recOld', 'A', 'recruiter', null],
      ['hr', 'A', 'panel', ['org.settings.manage']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@staff1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@staff1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.am}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      ids.entity = (await tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Kaveri Staffing Pvt Ltd', shortName: `KS-${run}`, isDefault: true, gstin: OURS } })).id;
    });
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('the desk is off by default: its pages refuse; the 6.2 settings turn it on (audited); only the settings holders may', async () => {
    expect((await api('emp', 'get', '/staffing/desk').expect(200)).body).toEqual({ enabled: false });
    expect((await api('am', 'get', '/staffing/clients').expect(403)).body.message).toMatch(/staffing desk is off/);
    const s = (await api('am', 'get', '/staffing/settings').expect(want(200))).body;
    expect(s).toMatchObject({ canEdit: true, values: { 'staffing.desk.enabled': 'off', 'staffing.ot_multiplier': '1.5', 'staffing.holiday_multiplier': '2', 'staffing.payment_terms_days': '30', 'staffing.rate_change.backdate_days': '0' } });
    expect((await api('rec', 'get', '/staffing/settings').expect(200)).body.canEdit).toBe(false);
    await api('emp', 'get', '/staffing/settings').expect(403);
    for (const who of ['rec', 'emp'] as const) await settings(who, [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(403);
    await settings('acting', [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(403);
    for (const bad of [[{ key: 'staffing.desk.enabled', value: 'yes' }], [{ key: 'hiring.reject.email_candidate', value: 'on' }], [{ key: 'staffing.ot_multiplier', value: '1.6' }], []])
      await settings('am', bad).expect(400);
    await settings('hr', [{ key: 'staffing.desk.enabled', value: 'on' }]).expect(want(200));
    expect((await api('emp', 'get', '/staffing/desk').expect(200)).body).toEqual({ enabled: true });
    expect((await api('adminB', 'get', '/staffing/desk').expect(200)).body).toEqual({ enabled: false });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'org.setting.changed', actorUserId: users.hr } }))).toBe(1);
  });

  it('clients: account managers add and change them; GSTIN checked against the billing state; duplicates 409; others refused', async () => {
    await api('rec', 'post', '/staffing/clients').send(client()).expect(403);
    await api('emp', 'post', '/staffing/clients').send(client()).expect(403);
    await api('acting', 'post', '/staffing/clients').send(client()).expect(403);
    const bad: Record<string, unknown>[] = [
      { gstin: TN.slice(0, 14) + (TN[14] === '0' ? '1' : '0') }, // wrong check character
      { gstin: 'ABC' },
      { gstin: KA }, // registered in Karnataka, billed in Tamil Nadu
      { state: 'IN-XX' },
      { state: 'Tamil Nadu' },
      { contractStart: '2027-04-01', contractEnd: '2027-03-31' },
      { accountManagerUserId: users.adminB },
      { paymentTermsDays: 181 },
      { name: '' },
      { status: 'closed' },
      { extra: 1 },
    ];
    for (const b of bad) await api('am', 'post', '/staffing/clients').send(client(b)).expect(400);
    ids.client = (await api('am', 'post', '/staffing/clients').send(client({ accountManagerUserId: users.am })).expect(want(201))).body.id;
    await api('am', 'post', '/staffing/clients').send(client({ gstin: null })).expect(409); // same name
    await api('am', 'post', '/staffing/clients').send(client({ name: 'Other name' })).expect(409); // same GSTIN
    ids.client2 = (await api('am', 'post', '/staffing/clients').send(client({ name: `Coromandel ${run}`, gstin: KA, state: 'IN-KA', billingAddress: 'Bengaluru' })).expect(want(201))).body.id;
    // Read: the recruiter sees clients, cannot change them.
    const list = (await api('rec', 'get', '/staffing/clients').expect(200)).body;
    expect(list.canManage).toBe(false);
    expect((await api('recOld', 'get', '/staffing/clients').expect(200)).body.canManage).toBe(false);
    await api('rec', 'post', '/staffing/clients').send(client({ name: `Not allowed ${run}`, gstin: null })).expect(403);
    expect(list.rows.map((r: { name: string }) => r.name)).toEqual([`Coromandel ${run}`, `Nilgiri Retail ${run}`]);
    const one = (await api('rec', 'get', `/staffing/clients/${ids.client}`).expect(200)).body;
    expect(one.client).toMatchObject({ gstin: TN, stateName: 'Tamil Nadu', status: 'active', accountManager: `am ${run}`, paymentTermsDays: null, defaultPaymentTermsDays: 30, contractEnd: '2027-03-31', slaFeedbackDays: 2, version: 1 });
    // Another company: not found; an employee: refused.
    await api('adminB', 'get', `/staffing/clients/${ids.client}`).expect(403); // B's desk is off
    await api('emp', 'get', `/staffing/clients/${ids.client}`).expect(403);
    // Change with the version; a stale version is 409; the change is audited field by field.
    await api('am', 'put', `/staffing/clients/${ids.client}`).send({ ...client({ status: 'on_hold', paymentTermsDays: 45 }), version: 1 }).expect(want(200));
    await api('am', 'put', `/staffing/clients/${ids.client}`).send({ ...client({ status: 'active' }), version: 1 }).expect(409);
    await api('am', 'put', `/staffing/clients/${randomUUID()}`).send({ ...client(), version: 1 }).expect(404);
    const audit = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'staffing.client.updated', entityId: ids.client } }));
    expect(JSON.parse(audit.metadataJson!).changed).toMatchObject({ status: { from: 'active', to: 'on_hold' }, paymentTermsDays: { from: null, to: 45 } });
  });

  it('another company with the desk on still cannot see or change this company’s clients (404)', async () => {
    await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.setting.create({ data: { organizationId: org.B.id, key: 'staffing.desk.enabled', scopeType: 'tenant', scopeId: org.B.id, value: 'on' } }));
    await api('adminB', 'get', `/staffing/clients/${ids.client}`).expect(404);
    await api('adminB', 'put', `/staffing/clients/${ids.client}`).send({ ...client(), version: 2 }).expect(404);
    await api('adminB', 'get', `/staffing/clients/${ids.client}/rates`).expect(404);
    await api('adminB', 'post', `/staffing/clients/${ids.client}/contacts`).send({ name: 'X', role: 'Y', email: 'x@y.test' }).expect(404);
    expect((await api('adminB', 'get', '/staffing/clients').expect(200)).body.rows).toEqual([]);
  });

  it('contacts: add, change, remove; one email per client; bad input 400', async () => {
    const path = `/staffing/clients/${ids.client}/contacts`;
    const c = { name: 'Meera Pillai', role: 'HR head', email: 'meera@nilgiri.test', phone: '+91 98450 12345', billing: true };
    await api('rec', 'post', path).send(c).expect(403);
    await api('acting', 'post', path).send(c).expect(403);
    for (const b of [{ email: 'not-an-email' }, { phone: 'abc' }, { name: '' }, { billing: 'yes' }]) await api('am', 'post', path).send({ ...c, ...b }).expect(400);
    const id = (await api('am', 'post', path).send(c).expect(want(201))).body.id;
    await api('am', 'post', path).send({ ...c, email: 'MEERA@nilgiri.test' }).expect(409);
    await api('am', 'put', `${path}/${id}`).send({ ...c, role: 'CHRO' }).expect(want(200));
    expect((await api('rec', 'get', `/staffing/clients/${ids.client}`).expect(200)).body.contacts).toEqual([expect.objectContaining({ id, role: 'CHRO', billing: true })]);
    await api('am', 'delete', `${path}/${id}`).expect(want(200));
    await api('am', 'delete', `${path}/${id}`).expect(404);
    expect((await api('rec', 'get', `/staffing/clients/${ids.client}`).expect(200)).body.contacts).toEqual([]);
    await api('am', 'post', path).send(c).expect(want(201)); // the email is free again
  });

  it('rate cards: exact money, pay never above bill, margins only for account managers; company multipliers as defaults', async () => {
    const path = `/staffing/clients/${ids.client}/rates`;
    const line = { role: 'Java Developer', skill: 'Java, Spring', location: 'Chennai', unit: 'hour', billRate: '1200', payRate: '800', validFrom: today };
    await api('rec', 'post', path).send(line).expect(403);
    await api('acting', 'post', path).send(line).expect(403);
    for (const b of [{ billRate: '12.345' }, { billRate: 1200 }, { billRate: '-5' }, { payRate: '1200.01' }, { unit: 'week' }, { ot: '1.6' }, { validFrom: addDays(today, -1) }, { validFrom: '14-11-2026' }])
      await api('am', 'post', path).send({ ...line, ...b }).expect(400);
    ids.rate = (await api('am', 'post', path).send(line).expect(want(201))).body.id;
    await api('am', 'post', path).send({ ...line, role: 'java developer' }).expect(409);
    await settings('am', [{ key: 'staffing.ot_multiplier', value: '2' }]).expect(want(200));
    await api('am', 'post', path).send({ ...line, role: 'QA Engineer', billRate: '900.50', payRate: '580.25' }).expect(want(201));
    const am = (await api('am', 'get', path).expect(200)).body;
    expect(am.showPay).toBe(true);
    expect(am.rows).toEqual([
      expect.objectContaining({ role: 'Java Developer', billRate: '1200.00', payRate: '800.00', marginPct: '33.3', ot: '1.5', holiday: '2', validFrom: today, validTo: null }),
      expect.objectContaining({ role: 'QA Engineer', billRate: '900.50', payRate: '580.25', marginPct: '35.6', ot: '2' }),
    ]);
    const rec = (await api('rec', 'get', path).expect(200)).body;
    expect(rec.showPay).toBe(false);
    for (const r of rec.rows) {
      expect(r).not.toHaveProperty('payRate');
      expect(r).not.toHaveProperty('marginPct');
    }
    expect(JSON.stringify(rec)).not.toMatch(/800\.00|580\.25/);
  });

  it('a dated rate change: after the current start, not backdated beyond the setting; the old rate ends the day before; a replaced rate is 409', async () => {
    const change = (who: Who, id: string, b: Record<string, unknown>) => api(who, 'post', `/staffing/rates/${id}/change`).send({ billRate: '1300', payRate: '850', reason: 'Annual revision agreed with client', ...b });
    await change('rec', ids.rate, { validFrom: addDays(today, 10) }).expect(403);
    await change('acting', ids.rate, { validFrom: addDays(today, 10) }).expect(403);
    await change('am', ids.rate, { validFrom: today }).expect(400); // not after the current start
    await change('am', ids.rate, { validFrom: addDays(today, 10), reason: '' }).expect(400);
    await change('am', ids.rate, { validFrom: addDays(today, 10), payRate: '1400' }).expect(400);
    await change('adminB', ids.rate, { validFrom: addDays(today, 10) }).expect(404);
    const next = (await change('am', ids.rate, { validFrom: addDays(today, 10) }).expect(want(201))).body.id;
    await change('am', ids.rate, { validFrom: addDays(today, 20) }).expect(409);
    const hist = (await api('am', 'get', `/staffing/clients/${ids.client}/rates?history=1`).expect(200)).body.rows.filter((r: { role: string }) => r.role === 'Java Developer');
    expect(hist.map((r: { billRate: string; validFrom: string; validTo: string | null }) => [r.billRate, r.validFrom, r.validTo])).toEqual([['1300.00', addDays(today, 10), null], ['1200.00', today, addDays(today, 9)]]);
    expect((await api('am', 'get', `/staffing/clients/${ids.client}/rates`).expect(200)).body.rows.filter((r: { role: string }) => r.role === 'Java Developer')).toHaveLength(1);
    // Backdating follows the company setting: from 0 (today or later) to 30 days back.
    await change('am', next, { validFrom: addDays(today, 5) }).expect(400);
    const qa = (await api('am', 'get', `/staffing/clients/${ids.client}/rates`).expect(200)).body.rows.find((r: { role: string }) => r.role === 'QA Engineer');
    await inA((tx) => tx.staffingRate.update({ where: { id: qa.id }, data: { validFrom: new Date(`${addDays(today, -60)}T00:00:00Z`) } }));
    await change('am', qa.id, { validFrom: addDays(today, -10), billRate: '950', payRate: '600' }).expect(400);
    await settings('am', [{ key: 'staffing.rate_change.backdate_days', value: '30' }]).expect(want(200));
    await change('am', qa.id, { validFrom: addDays(today, -10), billRate: '950', payRate: '600' }).expect(want(201));
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { action: 'staffing.rate.changed', entityId: ids.client }, orderBy: { createdAt: 'asc' } }));
    expect(audits).toHaveLength(2);
    expect(JSON.parse(audits[0]!.metadataJson!)).toMatchObject({ from: { bill: '1200.00', pay: '800.00' }, to: { bill: '1300.00', pay: '850.00' } });
  });

  it('invoice series: one per GSTIN and year, the GSTIN must be the entity’s, the next number never goes back', async () => {
    const body = { legalEntityId: ids.entity, gstin: OURS, financialYear: '2026-27', prefix: 'KS/INV/26-27/', nextNumber: 87 };
    await api('rec', 'post', '/staffing/invoice-series').send(body).expect(403);
    await api('acting', 'post', '/staffing/invoice-series').send(body).expect(403);
    for (const b of [{ gstin: TN }, { gstin: 'XYZ' }, { financialYear: '2026-28' }, { financialYear: '2026' }, { prefix: 'A very long prefix' }, { prefix: 'K S' }, { nextNumber: 0 }])
      await api('am', 'post', '/staffing/invoice-series').send({ ...body, ...b }).expect(400);
    await api('adminB', 'post', '/staffing/invoice-series').send(body).expect(404);
    const id = (await api('am', 'post', '/staffing/invoice-series').send(body).expect(want(201))).body.id;
    await api('hr', 'post', '/staffing/invoice-series').send(body).expect(409);
    await api('am', 'put', `/staffing/invoice-series/${id}`).send({ ...body, nextNumber: 86 }).expect(400);
    await api('am', 'put', `/staffing/invoice-series/${id}`).send({ ...body, nextNumber: 100, version: 1 }).expect(want(200));
    await api('am', 'put', `/staffing/invoice-series/${id}`).send({ ...body, nextNumber: 101, version: 1 }).expect(409);
    const s = (await api('am', 'get', '/staffing/settings').expect(200)).body;
    expect(s.series).toEqual([expect.objectContaining({ id, entity: 'Kaveri Staffing Pvt Ltd', gstin: OURS, prefix: 'KS/INV/26-27/', nextNumber: 100, version: 2 })]);
    expect(s.entities).toEqual([expect.objectContaining({ id: ids.entity, gstins: [OURS] })]);
    expect(await inA((tx) => tx.auditLog.count({ where: { entityId: id, action: { startsWith: 'staffing.invoice_series.' } } }))).toBe(2);
  });

  it('turning the desk off closes the pages again (data kept)', async () => {
    await settings('am', [{ key: 'staffing.desk.enabled', value: 'off' }]).expect(want(200));
    await api('am', 'get', '/staffing/clients').expect(403);
    await api('am', 'get', `/staffing/clients/${ids.client}/rates`).expect(403);
    // Answer 452: the recruiter's key works only while the desk is on.
    for (const who of ['rec', 'recOld'] as const) await api(who, 'get', '/staffing/clients').expect(403);
    expect(await inA((tx) => tx.staffingClient.count({ where: { organizationId: org.A.id } }))).toBe(2);
  });
});
