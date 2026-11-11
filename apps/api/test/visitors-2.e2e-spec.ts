import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { newDeviceToken, sha256 } from '../src/time/device-rules';
import { WalkInsService } from '../src/visitors/walkins.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Visitors slice 2 end to end (answers 601, 602, 604, 606, 610): walk-ins on a kiosk in visitor mode (bound to the
// enrolled device, refused on an attendance kiosk and when the location's kiosk is off) and at the reception desk;
// the host decides within the minutes, then reception (audited); the photo only to the host while they decide; visitor
// types with the NDA (a year for the same person and company) and the induction (every visit) from the Policies module;
// allowed hours guard the kiosk, reception overrides with a reason. Another company 404, acting 403, no key 403.

jest.setTimeout(240_000);

describe('Visitors slice 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let walkIns: WalkInsService;
  let blob: ReturnType<typeof createFakeBlobStorage>;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'host' | 'other' | 'reception' | 'facility' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const kioskTok: Record<string, string> = {};
  const mails: { to: string; subject: string; html: string }[] = [];
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const kiosk = (k: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/visitor-kiosk${path}`).set('x-kiosk-token', kioskTok[k]!);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  // Settings rows straight in the table, so the hours never depend on when the test runs.
  const setting = (key: string, value: string, scope: 'tenant' | 'location' = 'location') =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: scope, scopeId: scope === 'tenant' ? org.A.id : ids.maa };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });
  const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('walk-in photo')]).toString('base64');
  const MOBILE = '98110 44319';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string }) => (mails.push(m), { success: true })) })
      .overrideProvider(BlobStorageService).useValue((blob = createFakeBlobStorage()))
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    walkIns = moduleRef.get(WalkInsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `vis2-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `VIS2 Org ${k} ${run}`, slug: `vis2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null, string][] = [
      ['admin', 'A', 'org_admin', null, `Admin ${run}`],
      ['host', 'A', 'panel', [], `Anita Desai ${run}`],
      ['other', 'A', 'panel', [], `Ravi Kumar ${run}`],
      ['reception', 'A', 'panel', [], `Reena Front ${run}`],
      ['facility', 'A', 'panel', ['visitors.settings.manage'], `Farah Facility ${run}`],
      ['adminB', 'B', 'org_admin', null, `Admin B ${run}`],
    ];
    for (const [who, k, role, keys, name] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@vis2-${run}.test`, name, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      const loc = (name: string, code: string) => tx.location.create({ data: { ...x, legalEntityId: ids.entity, name, code, address: { lines: ['7 SIDCO Estate'], city: name.split(' ')[0], postalCode: '600032' }, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } });
      ids.maa = (await loc('Chennai office', 'MAA')).id;
      ids.hsr = (await loc('Hosur plant', 'HSR')).id;
      const role = await tx.permissionProfile.create({ data: { ...x, name: `Reception ${run}`, permissionsJson: JSON.stringify(tpl('reception')), templateKey: 'reception' } });
      await tx.roleGrant.create({ data: { ...x, userId: users.reception!, permissionProfileId: role.id, scopeType: 'location', locationId: ids.maa, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Chennai reception', grantedBy: users.admin! } });
      // Two published policies (an NDA and a safety induction) from the Policies module.
      for (const [k, title, body] of [['nda', 'Visitor NDA', '<p>Keep what you see confidential.</p>'], ['ind', 'Plant safety induction', '<p>Wear shoes. Follow the yellow lines.</p>']] as const) {
        const doc = await tx.policyDocument.create({ data: { ...x, number: k === 'nda' ? 901 : 902, title, category: 'Visitors', createdBy: users.admin! } });
        ids[`${k}Policy`] = doc.id;
        ids[`${k}Version`] = (await tx.policyVersion.create({ data: { ...x, policyId: doc.id, number: 1, status: 'published', bodyHtml: body, bodySha256: createHash('sha256').update(body).digest('hex'), writtenBy: users.admin!, publishedBy: users.admin!, publishedAt: new Date(), effectiveOn: new Date(), needsSecondPerson: false } })).id;
      }
      // Two kiosks at Chennai: one in visitor mode, one for attendance.
      for (const [k, mode] of [['visitor', 'visitor'], ['attendance', 'attendance']] as const) {
        const t = newDeviceToken(org.A.id);
        kioskTok[k] = t;
        await tx.timeDevice.create({ data: { ...x, kind: 'kiosk', code: `K-${k.slice(0, 3).toUpperCase()}-${run.slice(0, 4)}`, place: 'Lobby', locationId: ids.maa, mode, status: 'active', tokenHash: sha256(t) } });
      }
    });
    await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      const x = { organizationId: org.B.id };
      const e = await tx.legalEntity.create({ data: { ...x, name: 'Other Co', shortName: `OC${run.slice(0, 4).toUpperCase()}`, isDefault: true } });
      ids.bLoc = (await tx.location.create({ data: { ...x, legalEntityId: e.id, name: 'Pune office', code: 'PNQ', address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } })).id;
    });
    for (const [who, k] of [['admin', 'A'], ['host', 'A'], ['other', 'A'], ['reception', 'A'], ['facility', 'A'], ['adminB', 'B']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@vis2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.reception}`).expect(200)).body.accessToken;
    await setting('visitors.hours_from', '00:00');
    await setting('visitors.hours_to', '23:59');
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.visitAcknowledgement.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.visit.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.visitorWatch.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('606: visitor types are saved with the settings key, with published policies only; anyone reads them', async () => {
    const rows = [
      { name: 'Contractor', escort: true, ndaPolicyId: ids.ndaPolicy, inductionPolicyId: ids.indPolicy },
      { name: 'Customer', escort: false, ndaPolicyId: ids.ndaPolicy },
      { name: 'Interview candidate', escort: false },
    ];
    await api('reception', 'put', '/visitors/types').send({ types: rows }).expect(403);
    await api('acting', 'put', '/visitors/types').send({ types: rows }).expect(403);
    await api('facility', 'put', '/visitors/types').send({ types: [{ name: 'X', escort: false, ndaPolicyId: randomUUID() }] }).expect(400);
    await api('facility', 'put', '/visitors/types').send({ types: [{ name: 'Same', escort: false }, { name: 'same', escort: true }] }).expect(400);
    const saved = (await api('facility', 'put', '/visitors/types').send({ types: rows }).expect(want(200))).body;
    expect(saved.types.map((t: { name: string; nda: string | null; induction: string | null }) => [t.name, t.nda, t.induction])).toEqual([['Contractor', 'Visitor NDA', 'Plant safety induction'], ['Customer', 'Visitor NDA', null], ['Interview candidate', null, null]]);
    expect(saved.policies.map((p: { title: string }) => p.title)).toEqual(['Plant safety induction', 'Visitor NDA']);
    ids.contractor = saved.types[0].id;
    ids.customer = saved.types[1].id;
    expect((await api('host', 'get', '/visitors/types').expect(200)).body.types).toHaveLength(3);
    expect((await api('adminB', 'get', '/visitors/types').expect(200)).body.types).toEqual([]);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.types_saved' } }))).toBe(1);
  });

  it('601: the visitor kiosk needs its own token and visitor mode; it is off until the location turns it on', async () => {
    await request(server()).get('/api/v1/visitor-kiosk/me').expect(401);
    await request(server()).get('/api/v1/visitor-kiosk/me').set('x-kiosk-token', `${org.A.id}.not-a-real-token`).expect(401);
    await kiosk('attendance', 'get', '/me').expect(403);
    const off = (await kiosk('visitor', 'get', '/me').expect(200)).body;
    expect(off).toMatchObject({ location: 'Chennai office', on: false, open: false, photo: true });
    expect(off.types.map((t: { label: string }) => t.label)).toEqual(['Contractor', 'Customer', 'Interview candidate']);
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ name: 'P', mobile: MOBILE, hostName: 'Anita', noticeVersion: 'x' }).expect(200)).body).toEqual({ state: 'see-reception' });
    await setting('visitors.kiosk', 'on');
    expect((await kiosk('visitor', 'get', '/me').expect(200)).body).toMatchObject({ on: true, inHours: true, open: true });
  });

  it('610: outside the allowed hours the kiosk sends visitors to reception', async () => {
    await setting('visitors.hours_to', '00:00');
    const me = (await kiosk('visitor', 'get', '/me').expect(200)).body;
    expect(me).toMatchObject({ on: true, inHours: false, open: false });
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ name: 'Priyanka Sethi', mobile: MOBILE, hostName: 'Anita Desai', noticeVersion: 'x', photoBase64: JPEG }).expect(200)).body).toEqual({ state: 'see-reception' });
    await setting('visitors.hours_to', '23:59');
  });

  it('604/606/602: a kiosk walk-in reads the NDA and induction, gives a photo and waits; the host is told', async () => {
    const needs = (await kiosk('visitor', 'post', '/needs').send({ typeId: ids.contractor, mobile: MOBILE, company: 'Fairview Auditors' }).expect(200)).body;
    expect(needs.nda).toMatchObject({ title: 'Visitor NDA', text: 'Keep what you see confidential.', versionId: ids.ndaVersion });
    expect(needs.induction).toMatchObject({ title: 'Plant safety induction', versionId: ids.indVersion });
    const base = { name: 'Priyanka Sethi', mobile: MOBILE, company: 'Fairview Auditors', typeId: ids.contractor, hostName: 'anita desai', noticeVersion: needs.notice.version };
    // Refused: no photo (photo on), not a picture, the NDA not accepted, a host nobody or many match (see reception).
    await kiosk('visitor', 'post', '/walk-ins').send({ ...base, ndaVersionId: ids.ndaVersion, inductionVersionId: ids.indVersion }).expect(400);
    await kiosk('visitor', 'post', '/walk-ins').send({ ...base, photoBase64: Buffer.from('GIF89a').toString('base64'), ndaVersionId: ids.ndaVersion, inductionVersionId: ids.indVersion }).expect(400);
    await kiosk('visitor', 'post', '/walk-ins').send({ ...base, photoBase64: JPEG, inductionVersionId: ids.indVersion }).expect(409);
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...base, hostName: 'Nobody Here', photoBase64: JPEG, ndaVersionId: ids.ndaVersion, inductionVersionId: ids.indVersion }).expect(200)).body).toEqual({ state: 'see-reception' });
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...base, hostName: run, photoBase64: JPEG, ndaVersionId: ids.ndaVersion, inductionVersionId: ids.indVersion }).expect(200)).body).toEqual({ state: 'see-reception' });
    const w = (await kiosk('visitor', 'post', '/walk-ins').send({ ...base, photoBase64: JPEG, ndaVersionId: ids.ndaVersion, inductionVersionId: ids.indVersion }).expect(want(200))).body;
    expect(w).toMatchObject({ state: 'waiting', host: 'Anita' });
    ids.w1 = w.id;
    const v = await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: w.id } }));
    expect(v).toMatchObject({ status: 'waiting', walkIn: true, visitorMobile: '+919811044319', hostUserId: users.host, noticeAcceptedVia: 'kiosk' });
    expect(v.photoPath).toBeTruthy();
    expect(v.approvalDueAt!.getTime() - v.startsAt.getTime()).toBe(10 * 60_000);
    const acks = await inA((tx) => tx.visitAcknowledgement.findMany({ where: { visitId: w.id } }));
    expect(acks.map((a) => a.kind).sort()).toEqual(['induction', 'nda']);
    expect(acks[0]!.personKey).not.toContain('9811044319');
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.host, type: 'visitor.walkin.approval.host', entityId: w.id } }))).toBe(1);
    // Only the kiosk that started it reads it.
    expect((await kiosk('visitor', 'get', `/walk-ins/${w.id}`).expect(200)).body).toMatchObject({ state: 'waiting', host: 'Anita' });
    await kiosk('attendance', 'get', `/walk-ins/${w.id}`).expect(403);
    // The NDA counts for a year: the same person and company is not asked again (the induction is).
    const again = (await kiosk('visitor', 'post', '/needs').send({ typeId: ids.contractor, mobile: MOBILE, company: 'fairview  auditors' }).expect(200)).body;
    expect(again.nda).toBeNull();
    expect(again.induction).not.toBeNull();
    expect((await kiosk('visitor', 'post', '/needs').send({ typeId: ids.contractor, mobile: MOBILE, company: 'Another Firm' }).expect(200)).body.nda).not.toBeNull();
  });

  it('602/604: the host sees the photo and decides; nobody else sees it; reception waits for the timeout', async () => {
    const cards = (await api('host', 'get', '/visitors/approvals').expect(200)).body;
    expect(cards).toEqual([expect.objectContaining({ id: ids.w1, name: 'Priyanka Sethi', company: 'Fairview Auditors', hasPhoto: true })]);
    const photo = await api('host', 'get', `/visitors/walk-ins/${ids.w1}/photo`).expect(200);
    expect(photo.headers['cache-control']).toMatch(/no-store/);
    expect(photo.headers['content-type']).toMatch(/image\/jpeg/);
    await api('other', 'get', `/visitors/walk-ins/${ids.w1}/photo`).expect(404);
    await api('reception', 'get', `/visitors/walk-ins/${ids.w1}/photo`).expect(404);
    await api('adminB', 'get', `/visitors/walk-ins/${ids.w1}/photo`).expect(404);
    expect((await api('reception', 'post', `/visitors/walk-ins/${ids.w1}/decide`).send({ approve: true }).expect(409)).body.message).toMatch(/The host has until/);
    await api('other', 'post', `/visitors/walk-ins/${ids.w1}/decide`).send({ approve: true }).expect(404);
    await api('adminB', 'post', `/visitors/walk-ins/${ids.w1}/decide`).send({ approve: true }).expect(404);
    const done = (await api('host', 'post', `/visitors/walk-ins/${ids.w1}/decide`).send({ approve: true }).expect(want(200))).body;
    expect(done).toMatchObject({ status: 'on_site', statusText: 'On site', decidedVia: 'host', walkIn: true });
    expect(done.badge).toMatch(/^V-\d{4}$/);
    // After the decision the photo is gone from the host's view; the kiosk shows the badge.
    await api('host', 'get', `/visitors/walk-ins/${ids.w1}/photo`).expect(404);
    expect((await kiosk('visitor', 'get', `/walk-ins/${ids.w1}`).expect(200)).body).toMatchObject({ state: 'badge', badge: done.badge });
    await api('host', 'post', `/visitors/walk-ins/${ids.w1}/decide`).send({ approve: false }).expect(409);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.walkin_decided', entityId: ids.w1, actorUserId: users.host } }))).toBe(1);
  });

  it('604/610: reception adds a walk-in (reason outside the hours), decides after the timeout with a reason; audited', async () => {
    const needs = (await api('reception', 'get', `/visitors/desk/needs?locationId=${ids.maa}&typeId=${ids.customer}&mobile=9000011111&company=Acme`).expect(want(200))).body;
    expect(needs).toMatchObject({ inHours: true, nda: { title: 'Visitor NDA' }, induction: null });
    const hosts = (await api('reception', 'get', `/visitors/desk/hosts?locationId=${ids.maa}&q=anita`).expect(200)).body;
    expect(hosts).toEqual([expect.objectContaining({ value: users.host })]);
    const input = { locationId: ids.maa, hostUserId: users.host, name: 'Mohan Lal', mobile: '9000011111', company: 'Acme', typeId: ids.customer, purpose: 'vendor', noticeVersion: needs.notice.version, ndaVersionId: ids.ndaVersion };
    await api('acting', 'post', '/visitors/walk-ins').send(input).expect(403);
    await api('host', 'post', '/visitors/walk-ins').send(input).expect(403);
    await api('reception', 'post', '/visitors/walk-ins').send({ ...input, locationId: ids.hsr }).expect(403);
    await api('adminB', 'post', '/visitors/walk-ins').send({ ...input, locationId: ids.maa }).expect(404);
    await api('reception', 'post', '/visitors/walk-ins').send({ ...input, ndaVersionId: undefined }).expect(409);
    // Outside the hours: only with a reason.
    await setting('visitors.hours_to', '00:00');
    expect((await api('reception', 'post', '/visitors/walk-ins').send(input).expect(400)).body.message).toMatch(/Give the reason/);
    const made = (await api('reception', 'post', '/visitors/walk-ins').send({ ...input, hoursReason: 'Urgent boiler repair' }).expect(want(201))).body;
    await setting('visitors.hours_to', '23:59');
    expect(made).toMatchObject({ status: 'waiting', statusText: 'Waiting for host', walkIn: true, hoursOverride: 'Urgent boiler repair' });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.hours_overridden', entityId: made.id, actorUserId: users.reception } }))).toBe(1);
    // The host's minutes pass: reception decides, and a refusal needs the reason.
    await inA((tx) => tx.visit.update({ where: { id: made.id }, data: { approvalDueAt: new Date(Date.now() - 1000) } }));
    await api('acting', 'post', `/visitors/walk-ins/${made.id}/decide`).send({ approve: false, reason: 'x' }).expect(403);
    await api('reception', 'post', `/visitors/walk-ins/${made.id}/decide`).send({ approve: false }).expect(400);
    const no = (await api('reception', 'post', `/visitors/walk-ins/${made.id}/decide`).send({ approve: false, reason: 'Host is on leave' }).expect(want(200))).body;
    expect(no).toMatchObject({ status: 'declined', statusText: 'Rejected', decidedVia: 'reception' });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.walkin_decided', entityId: made.id, actorUserId: users.reception } }))).toBe(1);
    // The desk lists walk-ins with the rest of the day.
    const desk = (await api('reception', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(200)).body.visits as { id: string; status: string }[];
    expect(desk.find((x) => x.id === made.id)?.status).toBe('declined');
  });

  it('slice 3 on walk-ins: the watch list stops them (kiosk: see reception; desk: the name only); under 18 and the ID rule', async () => {
    await inA((tx) => tx.visitorWatch.create({ data: { organizationId: org.A.id, name: 'Manish Gupta', nameKey: 'manish gupta', mobile: '+919884500712', reason: 'Took photos of the packing line.', addedBy: users.facility!, reviewBy: new Date(Date.now() + 86_400_000) } }));
    const notice = (await kiosk('visitor', 'post', '/needs').send({ mobile: '9884500712' }).expect(200)).body.notice.version;
    const kioskBase = { mobile: '9000033333', hostName: 'anita desai', noticeVersion: notice, photoBase64: JPEG };
    // The watch list: by name (any mobile) or by mobile (any name); the kiosk never says why.
    for (const who of [{ name: 'manish  GUPTA' }, { name: 'M Gupta', mobile: '98845 00712' }])
      expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...kioskBase, ...who }).expect(200)).body).toEqual({ state: 'see-reception' });
    const desk = { locationId: ids.maa, hostUserId: users.host, name: 'Manish Gupta', mobile: '9000022222', noticeVersion: notice };
    const stop = (await api('reception', 'post', '/visitors/walk-ins').send(desk).expect(409)).body.message as string;
    expect(stop).toBe("Stop at reception: Manish Gupta can't come in. Don't issue a badge; call the admin on duty.");
    expect(await inA((tx) => tx.visit.count({ where: { visitorName: { contains: 'Gupta', mode: 'insensitive' } } }))).toBe(0);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.blocked', entityId: ids.maa, actorUserId: users.reception } }))).toBe(1);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.blocked', entityType: 'time_device' } }))).toBe(2);
    // Under 18: only with a named adult; no photo and no ID from them.
    const minor = { ...kioskBase, name: 'Arjun Rao', minor: true };
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...minor, photoBase64: undefined }).expect(400)).body.message).toMatch(/Name the adult/);
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...minor, minorAdult: 'Lakshmi Rao' }).expect(400)).body.message).toMatch(/No photo is taken/);
    expect((await api('reception', 'post', '/visitors/walk-ins').send({ ...desk, name: 'Arjun Rao', minor: true, minorAdult: 'Lakshmi Rao', idType: 'pan', idLast4: '234F' }).expect(400)).body.message).toMatch(/under 18 do not give ID/);
    const kid = (await kiosk('visitor', 'post', '/walk-ins').send({ ...minor, minorAdult: 'Lakshmi Rao', photoBase64: undefined }).expect(want(200))).body;
    expect(await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: kid.id } }))).toMatchObject({ status: 'waiting', minor: true, minorAdult: 'Lakshmi Rao', photoPath: null, idType: null });
    // The host's card says under 18 and names the adult (walk-through 11 Nov 2026).
    expect((await api('host', 'get', '/visitors/approvals').expect(200)).body).toContainEqual(expect.objectContaining({ id: kid.id, minorAdult: 'Lakshmi Rao' }));
    // The location takes ID: type and last 4 on the kiosk and at the desk; a photo of the ID only at reception.
    await setting('visitors.id_capture', 'on');
    const adult = { ...kioskBase, name: 'Kavitha Nair', mobile: '9000044444' };
    expect((await kiosk('visitor', 'post', '/walk-ins').send(adult).expect(400)).body.message).toMatch(/Choose the ID type/);
    const withId = (await kiosk('visitor', 'post', '/walk-ins').send({ ...adult, idType: 'pan', idLast4: '234f' }).expect(want(200))).body;
    expect(await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: withId.id } }))).toMatchObject({ idType: 'pan', idLast4: '234F' });
    expect((await api('reception', 'post', '/visitors/walk-ins').send({ ...desk, name: 'Kavitha Nair', mobile: '9000044444' }).expect(400)).body.message).toMatch(/Choose the ID type/);
    await setting('visitors.id_capture', 'with_image');
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...adult, name: 'Sunil Rao', mobile: '9000055555', idType: 'pan', idLast4: '234F' }).expect(200)).body).toEqual({ state: 'see-reception' });
    await setting('visitors.id_capture', 'off');
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...adult, name: 'Sunil Rao', mobile: '9000055555', idType: 'pan', idLast4: '234F' }).expect(400)).body.message).toMatch(/does not take ID/);
  });

  it('a kiosk photo that cannot be stored creates nothing (the visitor sees reception); a stopped walk-in keeps no photo', async () => {
    const notice = (await kiosk('visitor', 'post', '/needs').send({ mobile: '9000077001' }).expect(200)).body.notice.version;
    const base = { name: 'Sneha Kulkarni', mobile: '9000077001', hostName: 'anita desai', noticeVersion: notice, photoBase64: JPEG };
    blob.upload.mockRejectedValueOnce(new Error('storage down'));
    const r = (await kiosk('visitor', 'post', '/walk-ins').send(base).expect(503)).body;
    expect(r.message).toBe('We could not save your photo. Please see reception.');
    expect(await inA((tx) => tx.visit.count({ where: { visitorName: 'Sneha Kulkarni' } }))).toBe(0);
    // A walk-in that does not go ahead (a host nobody matches) leaves no photo behind.
    const before = blob.blobs.size;
    expect((await kiosk('visitor', 'post', '/walk-ins').send({ ...base, hostName: 'Nobody Here' }).expect(200)).body).toEqual({ state: 'see-reception' });
    expect(blob.blobs.size).toBe(before);
    // Stored: the visit carries its photo from the start.
    const ok = (await kiosk('visitor', 'post', '/walk-ins').send(base).expect(want(200))).body;
    expect(await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: ok.id } }))).toMatchObject({ status: 'waiting', photoPath: expect.stringContaining(ok.id) });
    await api('host', 'post', `/visitors/walk-ins/${ok.id}/decide`).send({ approve: false }).expect(want(200));
  });

  it('606: an invited visitor of a type reads the NDA on their link; the kiosk pass then asks only the rest', async () => {
    const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const inv = (await api('host', 'post', '/visitors/invites').send({ name: 'Kiran Rao', mobile: '9000022222', email: `kiran-${run}@visitor.test`, company: 'Fresh Co', purpose: 'audit', locationId: ids.maa, day: istToday, from: '00:01', to: '23:59', typeId: ids.contractor }).expect(want(201))).body;
    const link = mails.filter((m) => m.to === `kiran-${run}@visitor.test`).map((m) => m.html.match(/\/yx\/visit\/([A-Za-z0-9_-]{32})/)?.[1]).find(Boolean)!;
    const page = (await request(server()).get(`/api/v1/public/visits/${link}`).expect(200)).body;
    expect(page.needs).toMatchObject({ nda: { title: 'Visitor NDA' }, induction: { title: 'Plant safety induction' } });
    await request(server()).post(`/api/v1/public/visits/${link}/accept`).send({ noticeVersion: page.noticeVersion }).expect(409);
    await request(server()).post(`/api/v1/public/visits/${link}/accept`).send({ noticeVersion: page.noticeVersion, ndaVersionId: ids.ndaVersion, inductionVersionId: ids.indVersion }).expect(200);
    // The kiosk: the pass, nothing left to read, then in.
    const p = (await kiosk('visitor', 'post', '/pass').send({ code: inv.passCode }).expect(want(200))).body;
    expect(p).toMatchObject({ state: 'notice', id: inv.id, name: 'Kiran Rao', needs: { nda: null, induction: null } });
    await kiosk('attendance', 'post', `/visits/${inv.id}/check-in`).send({ noticeVersion: p.needs.notice.version }).expect(403);
    const inn = (await kiosk('visitor', 'post', `/visits/${inv.id}/check-in`).send({ noticeVersion: p.needs.notice.version }).expect(want(200))).body;
    expect(inn).toMatchObject({ state: 'badge', name: 'Kiran Rao' });
    expect((await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: inv.id } }))).status).toBe('on_site');
    // Another company's pass code is not found here; a used pass sends them to reception.
    expect((await kiosk('visitor', 'post', '/pass').send({ code: inv.passCode }).expect(200)).body).toEqual({ state: 'see-reception' });
  });

  it('606: reception ticks the type texts at check-in when they were not accepted on the link', async () => {
    const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
    const inv = (await api('host', 'post', '/visitors/invites').send({ name: 'Lata Iyer', mobile: '9000033333', email: `lata-${run}@visitor.test`, purpose: 'audit', locationId: ids.maa, day: istToday, from: '00:01', to: '23:59', typeId: ids.contractor }).expect(201)).body;
    const n = (await api('reception', 'get', `/visitors/${inv.id}/needs`).expect(200)).body;
    expect(n).toMatchObject({ nda: { title: 'Visitor NDA' }, induction: { title: 'Plant safety induction' } });
    await api('adminB', 'get', `/visitors/${inv.id}/needs`).expect(404);
    expect((await api('reception', 'post', `/visitors/${inv.id}/check-in`).send({ noticeAccepted: true }).expect(400)).body.message).toMatch(/Visitor NDA/);
    await api('reception', 'post', `/visitors/${inv.id}/check-in`).send({ noticeAccepted: true, ndaAccepted: true, inductionAccepted: true }).expect(want(200));
    expect((await inA((tx) => tx.visitAcknowledgement.findMany({ where: { visitId: inv.id } }))).map((a) => a.via)).toEqual(['desk', 'desk']);
  });

  it('711/713: the host sends a colleague (their own minutes and the photo; audited); reception sees the photo while it waits and on site', async () => {
    const notice = (await kiosk('visitor', 'post', '/needs').send({ mobile: '9000066666' }).expect(200)).body.notice.version;
    const w = (await kiosk('visitor', 'post', '/walk-ins').send({ name: 'Deepa Menon', mobile: '9000066666', hostName: 'anita desai', noticeVersion: notice, photoBase64: JPEG }).expect(want(200))).body;
    const send = (who: Who, userId: string) => api(who, 'post', `/visitors/walk-ins/${w.id}/send`).send({ userId });
    // Colleagues: the host only, never themselves.
    await api('other', 'get', `/visitors/walk-ins/${w.id}/colleagues?q=ravi`).expect(404);
    expect((await api('host', 'get', `/visitors/walk-ins/${w.id}/colleagues?q=ravi`).expect(200)).body).toEqual([expect.objectContaining({ value: users.other, label: `Ravi Kumar ${run}` })]);
    expect((await api('host', 'get', `/visitors/walk-ins/${w.id}/colleagues?q=anita`).expect(200)).body).toEqual([]);
    // Refused: acting, not the host, to themselves, someone in another company, not an id.
    await send('acting', users.other!).expect(403);
    await send('other', users.facility!).expect(404);
    await send('adminB', users.other!).expect(404);
    expect((await send('host', users.host!).expect(400)).body.message).toMatch(/not yourself/);
    await send('host', users.adminB!).expect(404);
    await send('host', 'not-an-id').expect(400);
    // 713: reception at the location sees the photo while it waits; nobody else at the desk route.
    expect((await api('reception', 'get', `/visitors/desk/visits/${w.id}/photo`).expect(200)).headers['cache-control']).toMatch(/no-store/);
    await api('host', 'get', `/visitors/desk/visits/${w.id}/photo`).expect(403);
    await api('adminB', 'get', `/visitors/desk/visits/${w.id}/photo`).expect(404);
    // Sent: the colleague has the card, the photo and fresh minutes; the host has neither now.
    const sent = (await send('host', users.other!).expect(want(200))).body;
    expect(sent).toMatchObject({ id: w.id, to: `Ravi Kumar ${run}` });
    expect(Date.parse(sent.dueAt) - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(((await api('host', 'get', '/visitors/approvals').expect(200)).body as { id: string }[]).some((a) => a.id === w.id)).toBe(false);
    await api('host', 'get', `/visitors/walk-ins/${w.id}/photo`).expect(404);
    await api('host', 'post', `/visitors/walk-ins/${w.id}/decide`).send({ approve: true }).expect(404);
    await send('host', users.facility!).expect(404);
    expect((await api('other', 'get', '/visitors/approvals').expect(200)).body).toEqual([expect.objectContaining({ id: w.id, hasPhoto: true })]);
    await api('other', 'get', `/visitors/walk-ins/${w.id}/photo`).expect(200);
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.other, type: 'visitor.walkin.approval.host', entityId: w.id } }))).toBe(1);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.walkin_sent', entityId: w.id, actorUserId: users.host } }))).toBe(1);
    expect((await kiosk('visitor', 'get', `/walk-ins/${w.id}`).expect(200)).body).toMatchObject({ state: 'waiting', host: 'Ravi' });
    // The colleague decides; reception still sees the photo on site, the host's route never after the decision.
    expect((await api('other', 'post', `/visitors/walk-ins/${w.id}/decide`).send({ approve: true }).expect(want(200))).body).toMatchObject({ status: 'on_site', decidedVia: 'host', hasPhoto: true });
    await api('other', 'get', `/visitors/walk-ins/${w.id}/photo`).expect(404);
    await api('reception', 'get', `/visitors/desk/visits/${w.id}/photo`).expect(200);
    await api('reception', 'post', `/visitors/${w.id}/check-out`).expect(want(200));
    await api('reception', 'get', `/visitors/desk/visits/${w.id}/photo`).expect(404);
  });

  it('the sweep closes undecided walk-ins at the end of their day and drops acknowledgements past their use', async () => {
    const kept = await inA((tx) => tx.visitAcknowledgement.count({ where: { organizationId: org.A.id } }));
    const w = (await kiosk('visitor', 'post', '/walk-ins').send({ name: 'Late Larry', mobile: '9000044444', hostName: 'Anita Desai', noticeVersion: (await kiosk('visitor', 'post', '/needs').send({ mobile: '9000044444' }).expect(200)).body.notice.version, photoBase64: JPEG }).expect(200)).body;
    await inA((tx) => tx.visit.update({ where: { id: w.id }, data: { startsAt: new Date(Date.now() - 7200_000), endsAt: new Date(Date.now() - 1000) } }));
    await walkIns.sweep();
    expect((await inA((tx) => tx.visit.findUniqueOrThrow({ where: { id: w.id } }))).status).toBe('declined');
    expect(await inA((tx) => tx.visitAcknowledgement.count({ where: { organizationId: org.A.id } }))).toBe(kept);
  });
});
