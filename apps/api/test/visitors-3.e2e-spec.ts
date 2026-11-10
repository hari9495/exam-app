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
import { VisitorWatchlistService } from '../src/visitors/visitor-watchlist.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Visitors slice 3 end to end (founder answers 603, 605, 614): the watch-list (HR or Facility admin adds a person with a
// reason, audited without it; only they see the list; a match blocks the visit and everyone else sees only that it
// can't go ahead; reviewed yearly or it lapses), ID proof (type and last 4 only; a photo of the ID only where the
// location asks, never of an Aadhaar card, virus-checked before it opens and deleted after the ID retention period) and
// visitors under 18 (only with a named adult; no ID). Another company gets 404, acting for someone else 403.

jest.setTimeout(240_000);

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

describe('Visitors slice 3', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let visitors: VisitorsService;
  let watchlist: VisitorWatchlistService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'host' | 'reception' | 'facility' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const mails: { to: string; subject: string; html: string }[] = [];
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const pub = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/public${path}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const invite = (over: Record<string, unknown> = {}) => ({ name: 'Rahul Menon', mobile: '98401 22871', email: `rahul-${run}@visitor.test`, purpose: 'meeting', locationId: ids.maa, day: istToday, from: '00:01', to: '23:59', ...over });
  const tokenOf = (email: string) => mails.filter((m) => m.to === email).map((m) => m.html.match(/\/yx\/visit\/([A-Za-z0-9_-]{32})/)?.[1]).find(Boolean)!;
  const audits = (action: string) => inA((tx) => tx.auditLog.findMany({ where: { action } }));

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
    watchlist = moduleRef.get(VisitorWatchlistService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `vis3-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `VIS3 Org ${k} ${run}`, slug: `vis3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['host', 'A', 'panel', []],
      ['reception', 'A', 'panel', []],
      // Answer 605: the Facility admin role (company-wide) holds the watch-list.
      ['facility', 'A', 'panel', tpl('facility_admin')],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@vis3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      const loc = (name: string, code: string) => tx.location.create({ data: { ...x, legalEntityId: ids.entity, name, code, address: { lines: ['7 SIDCO Estate'], city: name.split(' ')[0], postalCode: '600032' }, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } });
      ids.maa = (await loc('Chennai office', 'MAA')).id;
      ids.hsr = (await loc('Hosur plant', 'HSR')).id;
      const role = await tx.permissionProfile.create({ data: { ...x, name: `Reception ${run}`, permissionsJson: JSON.stringify(tpl('reception')), templateKey: 'reception' } });
      await tx.roleGrant.create({ data: { ...x, userId: users.reception!, permissionProfileId: role.id, scopeType: 'location', locationId: ids.maa, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Chennai reception', grantedBy: users.admin! } });
    });
    for (const [who, k] of [['admin', 'A'], ['host', 'A'], ['reception', 'A'], ['facility', 'A'], ['adminB', 'B']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@vis3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.facility}`).expect(200)).body.accessToken;
    // Answer 603 per location: Chennai takes the ID type and last 4; Hosur also keeps a photo of the ID.
    await api('admin', 'put', '/org/settings').send({ key: 'visitors.id_capture', scopeType: 'location', scopeId: ids.maa, value: 'on' }).expect(want(200));
    await api('admin', 'put', '/org/settings').send({ key: 'visitors.id_capture', scopeType: 'location', scopeId: ids.hsr, value: 'with_image' }).expect(want(200));
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.visit.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.visitorWatch.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('605 the watch-list: only HR and Facility admin see it; bad input, acting and other companies are refused; adds are audited without the reason', async () => {
    await api('host', 'get', '/visitors/watchlist').expect(403);
    await api('reception', 'get', '/visitors/watchlist').expect(403);
    expect((await api('facility', 'get', '/visitors/watchlist').expect(200)).body).toMatchObject({ entries: [], reviewDays: 365, canChange: true });
    for (const body of [{ name: 'Manish Gupta' }, { name: 'Manish Gupta', reason: 'bad' }, { name: 'M', reason: 'Took photos of the line.' }, { name: 'Manish Gupta', mobile: '12345', reason: 'Took photos of the line.' }, { name: '<b>x</b>', reason: 'Took photos of the line.' }])
      await api('facility', 'post', '/visitors/watchlist').send(body).expect(400);
    await api('acting', 'post', '/visitors/watchlist').send({ name: 'Manish Gupta', reason: 'Took photos of the line.' }).expect(403);
    await api('reception', 'post', '/visitors/watchlist').send({ name: 'Manish Gupta', reason: 'Took photos of the line.' }).expect(403);

    // A visit already invited before the entry is blocked when the entry is added.
    const before = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Manish Gupta', mobile: '98845 00712', email: `manish-${run}@visitor.test` })).expect(want(201))).body;
    expect(before.status).toBe('expected');
    const added = (await api('facility', 'post', '/visitors/watchlist').send({ name: '  Manish   Gupta ', mobile: '98845 00712', reason: 'Took photos of the packing line on 12 Aug.' }).expect(want(201))).body;
    expect(added.blockedVisits).toBe(1);
    ids.w1 = added.id;
    const list = (await api('facility', 'get', '/visitors/watchlist').expect(200)).body;
    expect(list.entries[0]).toMatchObject({ name: 'Manish   Gupta', mobile: '+919884500712', reason: 'Took photos of the packing line on 12 Aug.', addedBy: `facility ${run}` });
    // Acting for someone else does not open the list at all (its reasons are private).
    await api('acting', 'get', '/visitors/watchlist').expect(403);
    const log = await audits('visitor.watchlist.added');
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log[0], (_k, val) => (typeof val === 'bigint' ? String(val) : val))).not.toMatch(/packing|Manish/);
    // Another company: its own (empty) list; A's entry is not found.
    expect((await api('adminB', 'get', '/visitors/watchlist').expect(200)).body.entries).toEqual([]);
    await api('adminB', 'post', `/visitors/watchlist/${ids.w1}/review`).expect(404);
    await api('adminB', 'delete', `/visitors/watchlist/${ids.w1}`).expect(404);

    // Everyone else sees only that the visit can't go ahead: the host, reception, the visitor's link.
    const mine = (await api('host', 'get', '/visitors/mine').expect(200)).body;
    expect(mine.find((x: { id: string }) => x.id === before.id)).toMatchObject({ status: 'blocked', statusText: 'Blocked' });
    const desk = (await api('reception', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(200)).body;
    expect(desk.visits.find((x: { id: string }) => x.id === before.id).status).toBe('blocked');
    expect(JSON.stringify(desk)).not.toMatch(/packing/);
    const stop = await api('reception', 'post', `/visitors/${before.id}/check-in`).send({ noticeAccepted: true, idType: 'pan', idLast4: '123F' }).expect(409);
    expect(stop.body.message).toMatch(/can't go ahead/);
    expect(stop.body.message).not.toMatch(/packing|watch/i);
    const link = tokenOf(`manish-${run}@visitor.test`);
    const page = (await pub('get', `/visits/${link}`).expect(200)).body;
    expect(page.state).toBe('blocked');
    expect(page.passCode).toBeNull();
    await pub('post', `/visits/${link}/accept`).send({ noticeVersion: page.noticeVersion }).expect(409);
  });

  it('605 a new invite that matches (by name, another mobile) is blocked at once and no pass is emailed', async () => {
    const sentBefore = mails.length;
    const made = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'manish gupta', mobile: '90030 11999', email: `manish2-${run}@visitor.test` })).expect(want(201))).body;
    expect(made).toMatchObject({ status: 'blocked', statusText: 'Blocked', emailed: false });
    expect(mails.length).toBe(sentBefore);
    expect((await audits('visitor.blocked')).length).toBe(2);
  });

  it('605 review keeps an entry for another period; an unreviewed entry lapses and is deleted; remove deletes', async () => {
    await api('acting', 'post', `/visitors/watchlist/${ids.w1}/review`).expect(403);
    const r = (await api('facility', 'post', `/visitors/watchlist/${ids.w1}/review`).expect(200)).body;
    expect(Date.parse(r.reviewBy) - Date.now()).toBeGreaterThan(364 * 86_400_000);
    expect((await audits('visitor.watchlist.reviewed')).length).toBe(1);
    ids.w2 = (await api('admin', 'post', '/visitors/watchlist').send({ name: 'Sunil Rawat', reason: 'Abusive to reception staff.' }).expect(201)).body.id;
    // A year and a day later nobody reviewed them: both lapse.
    expect(await watchlist.lapseSweep(new Date(Date.now() + 367 * 86_400_000))).toBeGreaterThanOrEqual(2);
    expect(await inA((tx) => tx.visitorWatch.count())).toBe(0);
    expect((await audits('visitor.watchlist.lapsed')).length).toBe(1);
    ids.w3 = (await api('facility', 'post', '/visitors/watchlist').send({ name: 'Sunil Rawat', reason: 'Abusive to reception staff.' }).expect(201)).body.id;
    await api('facility', 'delete', `/visitors/watchlist/${ids.w3}`).expect(200);
    await api('facility', 'delete', `/visitors/watchlist/${ids.w3}`).expect(404);
    // With nobody on the list, the same person can be invited again.
    const again = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Sunil Rawat', email: `sunil-${run}@visitor.test` })).expect(201)).body;
    expect(again.status).toBe('expected');
  });

  it('603 ID on the link: type and last 4 only, never a full number; reception then sees it and does not ask again', async () => {
    const made = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Priya Iyer', mobile: '98400 11111', email: `priya-${run}@visitor.test` })).expect(want(201))).body;
    const link = tokenOf(`priya-${run}@visitor.test`);
    const page = (await pub('get', `/visits/${link}`).expect(200)).body;
    expect(page).toMatchObject({ idStep: true, idGiven: null, idRetentionDays: 30 });
    for (const id of [{ idType: 'aadhaar', idLast4: '1234 5678 9012' }, { idType: 'aadhaar', idLast4: '123456789012' }, { idType: 'ration', idLast4: '1234' }, { idType: 'pan' }])
      await pub('post', `/visits/${link}/accept`).send({ noticeVersion: page.noticeVersion, ...id }).expect(400);
    const done = (await pub('post', `/visits/${link}/accept`).send({ noticeVersion: page.noticeVersion, idType: 'aadhaar', idLast4: '9012' }).expect(want(200))).body;
    expect(done).toMatchObject({ state: 'pass', idGiven: { type: 'aadhaar', last4: '9012' } });
    const row = await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: made.id } }));
    expect(row).toMatchObject({ idType: 'aadhaar', idLast4: '9012' });
    const desk = (await api('reception', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(200)).body;
    expect(desk.idCapture).toBe('on');
    expect(desk.visits.find((x: { id: string }) => x.id === made.id).idText).toBe('Aadhaar ··9012');
    const inn = (await api('reception', 'post', `/visitors/${made.id}/check-in`).send({}).expect(want(200))).body;
    expect(inn.status).toBe('on_site');
  });

  it('603 ID at the desk: asked where the location takes it; another company 404, acting 403', async () => {
    const made = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Kiran Rao', mobile: '98450 22110', email: `kiran-${run}@visitor.test` })).expect(201)).body;
    await api('reception', 'post', `/visitors/${made.id}/check-in`).send({ noticeAccepted: true }).expect(400);
    await api('reception', 'post', `/visitors/${made.id}/check-in`).send({ noticeAccepted: true, idType: 'passport', idLast4: 'Z1234567' }).expect(400);
    await api('adminB', 'post', `/visitors/${made.id}/check-in`).send({ noticeAccepted: true, idType: 'passport', idLast4: 'Z123' }).expect(404);
    const inn = (await api('reception', 'post', `/visitors/${made.id}/check-in`).send({ noticeAccepted: true, idType: 'passport', idLast4: 'z123' }).expect(want(200))).body;
    expect(inn).toMatchObject({ status: 'on_site', idText: 'Passport ··Z123', hasIdImage: false });
  });

  it('603 a photo of the ID where the location asks: never of an Aadhaar card, virus-checked before it opens, reach checked, deleted after the ID retention', async () => {
    const made = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Ganesh Iyer', mobile: '98410 77120', email: `ganesh-${run}@visitor.test`, locationId: ids.hsr })).expect(201)).body;
    const up = (who: Who, fields: Record<string, string>, file = PNG, name = 'id.png') => {
      const r = api(who, 'post', `/visitors/${made.id}/id-image`);
      for (const [k, val] of Object.entries(fields)) r.field(k, val);
      return r.attach('file', file, name);
    };
    await api('admin', 'post', `/visitors/${made.id}/check-in`).send({ noticeAccepted: true, idType: 'driving_licence', idLast4: '4417' }).expect(400);
    await up('admin', { idType: 'aadhaar', idLast4: '4417' }).expect(400);
    await up('admin', { idType: 'driving_licence', idLast4: '4417' }, Buffer.from('<html>not an image</html>'), 'id.png').expect(400);
    await up('reception', { idType: 'driving_licence', idLast4: '4417' }).expect(403);
    await up('adminB', { idType: 'driving_licence', idLast4: '4417' }).expect(404);
    const res = (await up('admin', { idType: 'driving_licence', idLast4: '4417' }).expect(want(200))).body;
    expect(res.scan).toBe('pending');
    const row = await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: made.id } }));
    expect(row).toMatchObject({ idType: 'driving_licence', idLast4: '4417' });
    expect(row.idFileId).toBeTruthy();
    // Opened only once the virus check called it clean.
    const scan = () => inA((tx) => tx.file.findUniqueOrThrow({ where: { id: row.idFileId! } })).then((f) => f.scanStatus);
    for (let i = 0; i < 50 && (await scan()) === 'pending'; i++) await new Promise((r) => setTimeout(r, 100));
    expect(await scan()).toBe('clean');
    const img = await api('admin', 'get', `/visitors/${made.id}/id-image`).buffer(true).expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['cache-control']).toBe('no-store');
    expect((await audits('visitor.id_image_opened')).length).toBe(1);
    await api('reception', 'get', `/visitors/${made.id}/id-image`).expect(403);
    await api('adminB', 'get', `/visitors/${made.id}/id-image`).expect(404);
    const inn = (await api('admin', 'post', `/visitors/${made.id}/check-in`).send({ noticeAccepted: true }).expect(want(200))).body;
    expect(inn).toMatchObject({ status: 'on_site', idText: 'Driving licence ··4417', hasIdImage: true });
    // 40 days after the visit (the ID retention is 30): the ID details and the photo go; the visit stays.
    expect(await visitors.idSweep(new Date(Date.now() + 40 * 86_400_000))).toBeGreaterThanOrEqual(1);
    const after = await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: made.id } }));
    expect(after).toMatchObject({ idType: null, idLast4: null, idFileId: null });
    expect(await inA((tx) => tx.file.count({ where: { id: row.idFileId! } }))).toBe(0);
    expect((await audits('visitor.id_deleted')).length).toBeGreaterThanOrEqual(1);
    await api('admin', 'get', `/visitors/${made.id}/id-image`).expect(404);
  });

  it('614 a visitor under 18: only with a named adult, no ID from them, the adult confirmed at check-in', async () => {
    await api('host', 'post', '/visitors/invites').send(invite({ name: 'Aarav Menon', email: `aarav-${run}@visitor.test`, minor: true })).expect(400);
    await api('host', 'post', '/visitors/invites').send(invite({ name: 'Aarav Menon', email: `aarav-${run}@visitor.test`, minor: true, minorAdult: ' ' })).expect(400);
    const made = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Aarav Menon', mobile: '98401 22872', email: `aarav-${run}@visitor.test`, minor: true, minorAdult: 'Rahul Menon' })).expect(want(201))).body;
    expect(made).toMatchObject({ minor: true, minorAdult: 'Rahul Menon' });
    const link = tokenOf(`aarav-${run}@visitor.test`);
    const page = (await pub('get', `/visits/${link}`).expect(200)).body;
    expect(page.idStep).toBe(false);
    await pub('post', `/visits/${link}/accept`).send({ noticeVersion: page.noticeVersion, idType: 'pan', idLast4: '1234' }).expect(400);
    await pub('post', `/visits/${link}/accept`).send({ noticeVersion: page.noticeVersion }).expect(200);
    await api('reception', 'post', `/visitors/${made.id}/check-in`).send({}).expect(400);
    await api('reception', 'post', `/visitors/${made.id}/check-in`).send({ adultPresent: true, idType: 'pan', idLast4: '1234' }).expect(400);
    const inn = (await api('reception', 'post', `/visitors/${made.id}/check-in`).send({ adultPresent: true }).expect(want(200))).body;
    expect(inn.status).toBe('on_site');
    const row = await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: made.id } }));
    expect(row.adultConfirmedAt).toBeTruthy();
    // The database refuses an ID on a minor's visit, and more than 4 characters of any ID.
    await expect(inA((tx) => tx.visit.update({ where: { id: made.id }, data: { idType: 'pan', idLast4: '1234' } }))).rejects.toThrow();
    await expect(inA((tx) => tx.visit.update({ where: { id: made.id }, data: { minor: false, idType: 'aadhaar', idLast4: '123456789012' } }))).rejects.toThrow();
  });
});
