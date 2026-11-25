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
import { VisitorsService } from '../src/visitors/visitors.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Visitors slice 1 end to end (M02 §B11; founder answers 601-617): a host invites a visitor (the pass goes by email);
// the visitor reads the notice on their link and gets the pass; reception at that location checks them in by pass code
// and out; the log and its CSV; Settings 3.12; forgotten check-outs close at the end of the window (611); visits are
// deleted after the location's period, counts kept (608). Another company gets 404, acting for someone else 403, a
// person without the key 403, bad input 400, a repeat or a stale pass 409.

jest.setTimeout(240_000);

describe('Visitors slice 1', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let visitors: VisitorsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'host' | 'host2' | 'reception' | 'facility' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const mails: { to: string; subject: string; html: string }[] = [];
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const pub = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public${path}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const invite = (over: Record<string, unknown> = {}) => ({ name: 'Rahul Menon', mobile: '98401 22871', email: `rahul-${run}@visitor.test`, company: 'Nilgiri Pharma Ltd', purpose: 'meeting', locationId: ids.maa, day: istToday, from: '00:01', to: '23:59', ...over });
  const tokenOf = (email: string) => mails.filter((m) => m.to === email).map((m) => m.html.match(/\/yx\/visit\/([A-Za-z0-9_-]{32})/)?.[1]).find(Boolean)!;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string }) => (mails.push(m), { success: true })) })
      .overrideProvider(BlobStorageService).useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    visitors = moduleRef.get(VisitorsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `vis1-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `VIS1 Org ${k} ${run}`, slug: `vis1-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['host', 'A', 'panel', []],
      ['host2', 'A', 'panel', []],
      ['reception', 'A', 'panel', []],
      ['facility', 'A', 'panel', tpl('facility_admin').filter((k) => k === 'visitors.settings.manage')],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@vis1-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      const loc = (name: string, code: string) => tx.location.create({ data: { ...x, legalEntityId: ids.entity, name, code, address: { lines: ['7 SIDCO Estate'], city: name.split(' ')[0], postalCode: '600032' }, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } });
      ids.maa = (await loc('Chennai office', 'MAA')).id;
      ids.hsr = (await loc('Hosur plant', 'HSR')).id;
      // Answer 613: reception holds the Reception role at the Chennai office only.
      const role = await tx.permissionProfile.create({ data: { ...x, name: `Reception ${run}`, permissionsJson: JSON.stringify(tpl('reception')), templateKey: 'reception' } });
      await tx.roleGrant.create({ data: { ...x, userId: users.reception!, permissionProfileId: role.id, scopeType: 'location', locationId: ids.maa, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Chennai reception', grantedBy: users.admin! } });
    });
    await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      const x = { organizationId: org.B.id };
      const e = await tx.legalEntity.create({ data: { ...x, name: 'Other Co', shortName: `OC${run.slice(0, 4).toUpperCase()}`, isDefault: true } });
      ids.bLoc = (await tx.location.create({ data: { ...x, legalEntityId: e.id, name: 'Pune office', code: 'PNQ', address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } })).id;
    });
    for (const [who, k] of [['admin', 'A'], ['host', 'A'], ['host2', 'A'], ['reception', 'A'], ['facility', 'A'], ['adminB', 'B']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@vis1-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.reception}`).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.visit.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a host invites a visitor: the pass link goes by email; bad input, past windows and other companies are refused', async () => {
    const opts = (await api('host', 'get', '/visitors/options').expect(200)).body;
    expect(opts).toMatchObject({ desk: [], log: [], canSettings: false });
    expect(opts.locations.map((l: { label: string }) => l.label)).toEqual(['Chennai office', 'Hosur plant']);
    const made = (await api('host', 'post', '/visitors/invites').send(invite()).expect(want(201))).body;
    ids.v1 = made.id;
    expect(made).toMatchObject({ name: 'Rahul Menon', mobile: '+919840122871', status: 'expected', statusText: 'Expected', host: `host ${run}`, location: 'Chennai office', emailed: true });
    expect(made.passCode).toMatch(/^V-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    const mail = mails.find((m) => m.to === `rahul-${run}@visitor.test`)!;
    expect(mail.subject).toMatch(/^Your visit to VIS1 Org A/);
    expect(tokenOf(`rahul-${run}@visitor.test`)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.invited', entityId: made.id, actorUserId: users.host } }))).toBe(1);
    // Two more: one without the notice accepted on the link (accepted at the desk), one for tomorrow.
    ids.v2 = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Asha Kurian', mobile: '+44 7400 123456', email: `asha-${run}@visitor.test`, purpose: 'interview' })).expect(201)).body.id;
    ids.v3 = (await api('host2', 'post', '/visitors/invites').send(invite({ name: 'Suresh Babu', email: `suresh-${run}@visitor.test`, day: plusDays(istToday, 1), from: '10:00', to: '12:00', purpose: 'maintenance' })).expect(201)).body.id;
    // Refused: a bad mobile, an over window, leaving before arriving, a bad purpose, no email, an unknown or another company's location, acting.
    for (const [over, status] of [
      [{ mobile: '12345' }, 400],
      [{ day: plusDays(istToday, -1) }, 400],
      [{ from: '15:00', to: '14:00' }, 400],
      [{ purpose: 'party' }, 400],
      [{ email: 'not-an-email' }, 400],
      [{ locationId: randomUUID() }, 404],
      [{ locationId: ids.bLoc }, 404],
    ] as const)
      await api('host', 'post', '/visitors/invites').send(invite(over)).expect(status);
    await api('acting', 'post', '/visitors/invites').send(invite()).expect(403);
    // The host sees their own visitors only.
    expect((await api('host', 'get', '/visitors/mine').expect(200)).body.map((v: { id: string }) => v.id).sort()).toEqual([ids.v1, ids.v2].sort());
    expect((await api('host2', 'get', '/visitors/mine').expect(200)).body.map((v: { id: string }) => v.id)).toEqual([ids.v3]);
  });

  it('the visitor’s link: details with the mobile masked; the pass only after the notice (its own version); bad links 404', async () => {
    const t = tokenOf(`rahul-${run}@visitor.test`);
    const view = (await pub('get', `/visits/${t}`).expect(200)).body;
    expect(view).toMatchObject({ state: 'details', visitor: 'Rahul Menon', mobile: '+91 ••••• ••871', host: 'host', location: 'Chennai office', passCode: null, retentionDays: 90, hours: '09:00 to 18:30' });
    expect(view.brand).toMatchObject({ orgName: `VIS1 Org A ${run}` });
    expect(JSON.stringify(view)).not.toMatch(/9840122871|organizationId|hostUserId/);
    await pub('post', `/visits/${t}/accept`).send({ noticeVersion: 'v-000000000000' }).expect(409);
    const done = (await pub('post', `/visits/${t}/accept`).send({ noticeVersion: view.noticeVersion, vehicle: 'tn 09 bx 4471' }).expect(200)).body;
    expect(done).toMatchObject({ state: 'pass', vehicle: 'TN 09 BX 4471' });
    expect(done.passCode).toMatch(/^V-/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.notice_accepted', entityId: ids.v1 } }))).toBe(1);
    await pub('get', '/visits/short').expect(404);
    await pub('get', `/visits/${'x'.repeat(32)}`).expect(404);
  });

  it('reception at its location: today’s list, find by pass code, check in (the notice at the desk when needed) and out', async () => {
    await api('host', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(403);
    await api('reception', 'get', `/visitors/desk?locationId=${ids.hsr}`).expect(403);
    await api('adminB', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(404);
    const desk = (await api('reception', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(200)).body;
    expect(desk).toMatchObject({ location: { name: 'Chennai office' }, today: istToday, canChange: true });
    expect(desk.visits.map((v: { id: string }) => v.id).sort()).toEqual([ids.v1, ids.v2].sort());
    const v1 = await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: ids.v1 } }));
    const v3 = await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: ids.v3 } }));
    expect((await api('reception', 'post', '/visitors/desk/find').send({ code: v1.passCode.toLowerCase().replace(/-/g, ' '), locationId: ids.maa }).expect(200)).body.id).toBe(ids.v1);
    await api('reception', 'post', '/visitors/desk/find').send({ code: 'nonsense', locationId: ids.maa }).expect(400);
    await api('reception', 'post', '/visitors/desk/find').send({ code: 'V-AAAA-AAAA', locationId: ids.maa }).expect(404);
    // Tomorrow's pass: found, but not checked in today.
    expect((await api('reception', 'post', `/visitors/${ids.v3}/check-in`).send({}).expect(409)).body.message).toMatch(/^This pass is for .+, not today\.$/);
    await api('adminB', 'post', '/visitors/desk/find').send({ code: v3.passCode, locationId: ids.bLoc }).expect(404);
    // In: the notice was accepted on the link.
    await api('acting', 'post', `/visitors/${ids.v1}/check-in`).send({}).expect(403);
    const inn = (await api('reception', 'post', `/visitors/${ids.v1}/check-in`).send({}).expect(200)).body;
    expect(inn).toMatchObject({ status: 'on_site', badge: expect.stringMatching(/^V-\d{4}$/) });
    expect((await api('reception', 'post', `/visitors/${ids.v1}/check-in`).send({}).expect(409)).body.message).toMatch(/already checked in/);
    // The second visitor never opened the link: reception confirms the notice at the desk.
    expect((await api('reception', 'post', `/visitors/${ids.v2}/check-in`).send({}).expect(400)).body.message).toMatch(/Tick that the visitor read and accepted the notice/);
    await api('reception', 'post', `/visitors/${ids.v2}/check-in`).send({ noticeAccepted: true }).expect(200);
    expect(await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: ids.v2 }, select: { noticeAcceptedVia: true } }))).toEqual({ noticeAcceptedVia: 'desk' });
    // Out, once.
    await api('reception', 'post', `/visitors/${ids.v1}/check-out`).expect(200);
    await api('reception', 'post', `/visitors/${ids.v1}/check-out`).expect(409);
    await api('adminB', 'post', `/visitors/${ids.v1}/check-out`).expect(404);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: { in: ['visitor.checked_in', 'visitor.checked_out'] }, entityId: ids.v1, actorUserId: users.reception } }))).toBe(2);
    // Used pass: the link says it has expired.
    expect((await pub('get', `/visits/${tokenOf(`rahul-${run}@visitor.test`)}`).expect(200)).body.state).toBe('expired');
  });

  it('cancel: the host or reception at the visit’s location, only while expected; the link then says the visit is blocked', async () => {
    const v4 = (await api('host2', 'post', '/visitors/invites').send(invite({ name: 'Ganesh Iyer', email: `ganesh-${run}@visitor.test`, locationId: ids.hsr, day: plusDays(istToday, 1), from: '10:00', to: '12:00', purpose: 'maintenance' })).expect(201)).body.id;
    await api('host', 'post', `/visitors/${v4}/cancel`).expect(403); // not their visitor
    await api('reception', 'post', `/visitors/${v4}/cancel`).expect(403); // Hosur: reception is Chennai only
    await api('acting', 'post', `/visitors/${v4}/cancel`).expect(403);
    await api('adminB', 'post', `/visitors/${v4}/cancel`).expect(404);
    await api('host2', 'post', `/visitors/${v4}/cancel`).expect(200);
    await api('host2', 'post', `/visitors/${v4}/cancel`).expect(409);
    const t = tokenOf(`ganesh-${run}@visitor.test`);
    expect((await pub('get', `/visits/${t}`).expect(200)).body).toMatchObject({ state: 'blocked', passCode: null });
    await pub('post', `/visits/${t}/accept`).send({ noticeVersion: 'x' }).expect(409);
    // Reception cancels a visit at its own location.
    expect((await api('reception', 'post', `/visitors/${ids.v3}/cancel`).expect(200)).body.status).toBe('cancelled');
  });

  it('the log and its CSV: the locations in reach; no mobile numbers in the CSV', async () => {
    await api('host', 'get', '/visitors/log').expect(403);
    const log = (await api('reception', 'get', '/visitors/log').expect(200)).body;
    expect(log.locations.map((l: { label: string }) => l.label)).toEqual(['Chennai office']);
    expect(log.visits.map((v: { id: string }) => v.id).sort()).toEqual([ids.v1, ids.v2].sort());
    expect(log.visits[0].deletedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await api('reception', 'get', `/visitors/log?locationId=${ids.hsr}`).expect(404);
    const csv = (await api('reception', 'get', '/visitors/log.csv').expect(200)).text;
    expect(csv.split('\r\n')[0]).toBe('Visitor,Company,Host,Purpose,Location,In,Out,Status,Notice accepted');
    expect(csv).toContain('"Rahul Menon"');
    expect(csv).not.toMatch(/9840122871|7400123456/);
    expect((await api('admin', 'get', '/visitors/log').expect(200)).body.locations).toHaveLength(2);
  });

  it('Settings 3.12: Facility admin and HR change it (audited); others read or are refused; a location’s own value is named', async () => {
    const s = (await api('facility', 'get', '/visitors/settings').expect(200)).body;
    expect(s).toMatchObject({ canEdit: true, values: { 'visitors.retention_days': '90', 'visitors.id_capture': 'off', 'visitors.photo': 'on', 'visitors.hours_from': '09:00', 'visitors.badge': 'name_qr' } });
    expect((await api('reception', 'get', '/visitors/settings').expect(200)).body.canEdit).toBe(false);
    await api('host', 'get', '/visitors/settings').expect(403);
    await api('reception', 'put', '/visitors/settings').send({ changes: [{ key: 'visitors.photo', value: 'off' }] }).expect(403);
    await api('acting', 'put', '/visitors/settings').send({ changes: [{ key: 'visitors.photo', value: 'off' }] }).expect(403);
    for (const changes of [[{ key: 'visitors.retention_days', value: '91' }], [{ key: 'hiring.pay_range.show', value: 'on' }], [{ key: 'visitors.hours_from', value: '19:00' }], [{ key: 'visitors.notice', value: '<b>hi</b>' }]])
      await api('facility', 'put', '/visitors/settings').send({ changes }).expect(400);
    const after = (await api('facility', 'put', '/visitors/settings').send({ changes: [{ key: 'visitors.badge', value: 'phone_only' }, { key: 'visitors.notice', value: 'Wear your badge. Stay with your host.' }] }).expect(200)).body;
    expect(after.values).toMatchObject({ 'visitors.badge': 'phone_only', 'visitors.notice': 'Wear your badge. Stay with your host.' });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'org.setting.changed', actorUserId: users.facility } }))).toBe(2);
    // A changed notice must be accepted again on a link.
    const t = tokenOf(`asha-${run}@visitor.test`);
    expect((await pub('get', `/visits/${t}`).expect(200)).body.notice).toBe('Wear your badge. Stay with your host.');
    // Hosur keeps visits 30 days (its own value, set on the company rules page): named on the field.
    await api('admin', 'put', '/org/settings').send({ key: 'visitors.retention_days', scopeType: 'location', scopeId: ids.hsr, value: '30' }).expect(want(200));
    expect((await api('facility', 'get', '/visitors/settings').expect(200)).body.overrides['visitors.retention_days']).toEqual(['Hosur plant']);
    expect((await api('adminB', 'get', '/visitors/settings').expect(200)).body.values['visitors.badge']).toBe('name_qr');
  });

  it('answers 611 and 608: forgotten check-outs close at the end of the window; visits go after the location’s period, counts kept', async () => {
    const past = new Date(Date.now() - 3_600_000);
    const mk = (over: Record<string, unknown>) =>
      inA((tx) => tx.visit.create({ data: { organizationId: org.A.id, locationId: ids.maa, hostUserId: users.host!, visitorName: 'Old visitor', visitorMobile: '+919840122871', purpose: 'audit', startsAt: new Date(past.getTime() - 3_600_000), endsAt: past, passToken: randomUUID().replace(/-/g, '').slice(0, 32), passCode: `V-T${run.slice(0, 3).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`, createdBy: users.host!, ...over } }));
    const onSite = await mk({ status: 'on_site', checkedInAt: past });
    const never = await mk({ status: 'expected' });
    expect(await visitors.closeSweep()).toBeGreaterThanOrEqual(2);
    expect((await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: onSite.id } }))).status).toBe('not_out');
    expect((await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: never.id } }))).status).toBe('no_show');
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.auto_closed', organizationId: org.A.id } }))).toBeGreaterThanOrEqual(1);
    // Chennai keeps 90 days (company); Hosur 30 (its own value).
    const d = (n: number) => new Date(Date.now() - n * 86_400_000);
    const old = await mk({ status: 'checked_out', startsAt: d(101), endsAt: d(100) });
    const kept = await mk({ status: 'checked_out', startsAt: d(51), endsAt: d(50) });
    const hosur = await mk({ status: 'checked_out', locationId: ids.hsr, startsAt: d(41), endsAt: d(40) });
    const swept = await visitors.retentionSweep();
    const left = (await inA((tx) => tx.visit.findMany({ where: { id: { in: [old.id, kept.id, hosur.id] } }, select: { id: true, locationId: true } }))).map((x) => (x.id === kept.id ? 'kept' : x.id === old.id ? 'old' : 'hosur'));
    expect(left).toEqual(['kept']);
    expect(swept).toBeGreaterThanOrEqual(2);
    expect(await inA((tx) => tx.visitCount.aggregate({ where: { organizationId: org.A.id, purpose: 'audit' }, _sum: { visits: true } }))).toMatchObject({ _sum: { visits: 2 } });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.retention_deleted', organizationId: org.A.id } }))).toBeGreaterThanOrEqual(2);
  });

  it('row-level security: another company sees none of these visits', async () => {
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.visit.count())).toBe(0);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.visit.count({ where: { organizationId: org.A.id } }))).toBe(0);
  });
});
