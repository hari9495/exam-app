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

// Visitors slice 4 end to end (founder answers 607, 608, 612): the badge as a label-size PDF for a visitor on site (none
// where the location uses the pass on the phone only); reports from counts with no names, including the counts kept
// after deletion; the emergency roll-call (visitors and employees on site now) for reception, security and HR, as JSON
// and as one PDF; the host warned about an invite outside the allowed hours (652). Another company gets 404, a person without the key or at another location 403, bad input 400 or 409.

jest.setTimeout(240_000);

describe('Visitors slice 4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let visitors: VisitorsService;
  let blob: BlobStorageService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'host' | 'reception' | 'security' | 'hr' | 'adminB';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const istToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const invite = (over: Record<string, unknown> = {}) => ({ name: 'Rahul Menon', mobile: '98401 22871', email: `rahul-${run}@visitor.test`, purpose: 'meeting', locationId: ids.maa, day: istToday, from: '00:01', to: '23:59', ...over });
  const pdf = (r: request.Response) => {
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['cache-control']).toBe('no-store');
    expect((r.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  };
  const binary = (req: request.Test) => req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService).useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    blob = moduleRef.get(BlobStorageService);
    visitors = moduleRef.get(VisitorsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `vis4-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `VIS4 Org ${k} ${run}`, slug: `vis4-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const roster: [Who, 'A' | 'B', string][] = [['admin', 'A', 'org_admin'], ['host', 'A', 'panel'], ['reception', 'A', 'panel'], ['security', 'A', 'panel'], ['hr', 'A', 'panel'], ['adminB', 'B', 'org_admin']];
    for (const [who, k, role] of roster) {
      const o = org[k].id;
      const permissionProfileId = role === 'panel' ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: '[]' } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@vis4-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.entity2 = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Plants Pvt Ltd', shortName: `KP${run.slice(0, 4).toUpperCase()}` } })).id;
      const loc = (name: string, code: string, entity: string) => tx.location.create({ data: { ...x, legalEntityId: entity, name, code, address: { lines: ['7 SIDCO Estate'], city: name.split(' ')[0], postalCode: '600032' }, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } });
      ids.maa = (await loc('Chennai office', 'MAA', ids.entity)).id;
      ids.hsr = (await loc('Hosur plant', 'HSR', ids.entity2)).id;
      const grant = async (who: Who, key: string, scope: { scopeType: string; locationId?: string; legalEntityId?: string }) => {
        const role = await tx.permissionProfile.create({ data: { ...x, name: `${key} ${who} ${run}`, permissionsJson: JSON.stringify(tpl(key)), templateKey: key } });
        await tx.roleGrant.create({ data: { ...x, userId: users[who]!, permissionProfileId: role.id, ...scope, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Slice 4', grantedBy: users.admin! } });
      };
      // Reception and security at the Chennai office; HR admin for the Chennai entity (612: reception, security and HR).
      await grant('reception', 'reception', { scopeType: 'location', locationId: ids.maa });
      await grant('security', 'security', { scopeType: 'location', locationId: ids.maa });
      await grant('hr', 'hr_admin', { scopeType: 'legal_entity', legalEntityId: ids.entity });
      // Two employees: one checked in at Chennai now; one checked in and then out.
      const emp = async (given: string, code: string) => {
        const person = await tx.person.create({ data: { ...x, givenName: given } });
        const e = await tx.employee.create({ data: { ...x, personId: person.id, givenName: given, familyName: run } });
        await tx.employment.create({ data: { ...x, employeeId: e.id, legalEntityId: ids.entity, employeeCode: code, codeScopeKey: ids.entity, joinedOn: new Date('2024-01-01') } });
        return e.id;
      };
      ids.in = await emp('Neha', `KF-${run.slice(0, 4)}-1`);
      ids.out = await emp('Ravi', `KF-${run.slice(0, 4)}-2`);
      const now = Date.now();
      const p = (employeeId: string, kind: string, minsAgo: number, locationId: string | null) => ({ ...x, employeeId, kind, punchedAt: new Date(now - minsAgo * 60_000), workOn: new Date(`${istToday}T00:00:00Z`), accepted: true, verdict: 'inside', locationId });
      await tx.punch.createMany({ data: [p(ids.in, 'in', 30, ids.maa), p(ids.out, 'in', 60, ids.maa), p(ids.out, 'out', 10, null)] });
    });
    for (const [who, k] of [['admin', 'A'], ['host', 'A'], ['reception', 'A'], ['security', 'A'], ['hr', 'A'], ['adminB', 'B']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@vis4-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.visit.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.visitCount.deleteMany({ where: { organizationId: { in: [org.A.id, org.B.id] } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('607 the badge: a label-size PDF for a visitor on site; refused before check-in, at another location, for another company, and where the pass is on the phone only', async () => {
    const made = (await api('host', 'post', '/visitors/invites').send(invite()).expect(want(201))).body;
    ids.v1 = made.id;
    // Answer 652: outside the allowed hours (09:00 to 18:30) the host is warned, never refused; inside, no warning.
    expect(made.outsideHours).toBe('09:00 to 18:30');
    const tomorrow = new Date(Date.parse(`${istToday}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const inHours = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Kiran Rao', email: `kiran-${run}@visitor.test`, day: tomorrow, from: '10:00', to: '11:00' })).expect(want(201))).body;
    expect(inHours.outsideHours).toBeNull();
    await api('reception', 'get', `/visitors/${made.id}/badge.pdf`).expect(409);
    const desk = (await api('reception', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(200)).body;
    expect(desk.badge).toBe('name_qr');
    await api('reception', 'post', `/visitors/${made.id}/check-in`).send({ noticeAccepted: true }).expect(want(200));
    const r = await binary(api('reception', 'get', `/visitors/${made.id}/badge.pdf`)).expect(want(200));
    pdf(r);
    // Drawn, not just a header: the QR image and the text fonts are in the file.
    expect((r.body as Buffer).toString('latin1')).toMatch(/\/Subtype \/Image/);
    expect((r.body as Buffer).toString('latin1')).toMatch(/\/Type \/Font/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.badge_printed', entityId: made.id, actorUserId: users.reception } }))).toBe(1);
    await api('security', 'get', `/visitors/${made.id}/badge.pdf`).expect(403);
    await api('adminB', 'get', `/visitors/${made.id}/badge.pdf`).expect(404);
    await api('reception', 'get', '/visitors/not-a-uuid/badge.pdf').expect(400);
    const hosur = (await api('host', 'post', '/visitors/invites').send(invite({ name: 'Ganesh Iyer', email: `ganesh-${run}@visitor.test`, locationId: ids.hsr })).expect(201)).body;
    await api('admin', 'post', `/visitors/${hosur.id}/check-in`).send({ noticeAccepted: true }).expect(want(200));
    await api('reception', 'get', `/visitors/${hosur.id}/badge.pdf`).expect(403);
    await api('admin', 'put', '/org/settings').send({ key: 'visitors.badge', scopeType: 'location', scopeId: ids.hsr, value: 'phone_only' }).expect(want(200));
    const phone = await api('admin', 'get', `/visitors/${hosur.id}/badge.pdf`).expect(409);
    expect(phone.body.message).toMatch(/pass on the visitor's phone/);
    expect((await api('admin', 'get', `/visitors/desk?locationId=${ids.hsr}`).expect(200)).body.badge).toBe('phone_only');
  });

  it('612 the roll-call: visitors and employees on site now, for reception, security and HR in scope; refused elsewhere', async () => {
    const r = (await api('security', 'get', `/visitors/rollcall?locationId=${ids.maa}`).expect(want(200))).body;
    expect(r.location.name).toBe('Chennai office');
    expect(r.visitors.map((v: { name: string }) => v.name)).toEqual(['Rahul Menon']);
    // Neha is in; Ravi checked in and then out (his check-out had no location): only Neha.
    expect(r.employees.map((e: { name: string }) => e.name)).toEqual([`Neha ${run}`]);
    expect(r.employees[0].code).toBe(`KF-${run.slice(0, 4)}-1`);
    expect(JSON.stringify(r)).not.toMatch(/mobile|\+91/);
    expect((await api('hr', 'get', '/visitors/rollcall').expect(200)).body.location.id).toBe(ids.maa);
    expect((await api('reception', 'get', `/visitors/rollcall?locationId=${ids.maa}`).expect(200)).body.employees).toHaveLength(1);
    // Out of reach: another location (security, HR of the other entity), another company, a person without the key, bad input.
    await api('security', 'get', `/visitors/rollcall?locationId=${ids.hsr}`).expect(403);
    await api('hr', 'get', `/visitors/rollcall?locationId=${ids.hsr}`).expect(403);
    await api('adminB', 'get', `/visitors/rollcall?locationId=${ids.maa}`).expect(404);
    await api('host', 'get', '/visitors/rollcall').expect(403);
    await api('security', 'get', '/visitors/rollcall?locationId=nope').expect(400);
    const p = await binary(api('security', 'get', `/visitors/rollcall.pdf?locationId=${ids.maa}`)).expect(want(200));
    pdf(p);
    expect((p.body as Buffer).toString('latin1')).toMatch(/\/Type \/Font/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.rollcall_printed', actorUserId: users.security } }))).toBe(1);
    await api('security', 'get', '/visitors/rollcall.pdf').expect(400);
    await api('security', 'get', `/visitors/rollcall.pdf?locationId=${ids.hsr}`).expect(403);
    // Security cannot run the desk or read the log.
    await api('security', 'get', `/visitors/desk?locationId=${ids.maa}`).expect(403);
    await api('security', 'get', '/visitors/log').expect(403);
  });

  it('608 reports: counts only, by location, purpose and month, including counts kept after deletion; reach checked', async () => {
    await api('reception', 'post', `/visitors/${ids.v1}/check-out`).expect(want(200));
    const before = (await api('admin', 'get', '/visitors/reports').expect(want(200))).body;
    expect(before.total).toBe(2);
    expect(before.byLocation).toEqual([{ label: 'Chennai office', visits: 1 }, { label: 'Hosur plant', visits: 1 }]);
    expect(before.byPurpose).toEqual([{ label: 'Meeting', visits: 2 }]);
    expect(JSON.stringify(before)).not.toMatch(/Rahul|Ganesh|host /);
    // The visit goes after its retention; its count stays (608), so the report does not change.
    expect(await visitors.retentionSweep(new Date(Date.now() + 400 * 86_400_000), [org.A.id, org.B.id])).toBeGreaterThanOrEqual(1);
    expect(await inA((tx) => tx.visit.count({ where: { id: ids.v1 } }))).toBe(0);
    const after = (await api('admin', 'get', '/visitors/reports').expect(200)).body;
    expect(after.byLocation.find((x: { label: string }) => x.label === 'Chennai office').visits).toBe(1);
    // Reception sees only its own location; another location is not found; from after to is refused; no key: 403.
    const rec = (await api('reception', 'get', '/visitors/reports').expect(200)).body;
    expect(rec.byLocation).toEqual([{ label: 'Chennai office', visits: 1 }]);
    await api('reception', 'get', `/visitors/reports?locationId=${ids.hsr}`).expect(403);
    await api('admin', 'get', `/visitors/reports?from=${istToday}&to=2020-01-01`).expect(409);
    await api('security', 'get', '/visitors/reports').expect(403);
    await api('host', 'get', '/visitors/reports').expect(403);
    await api('adminB', 'get', `/visitors/reports?locationId=${ids.maa}`).expect(404);
  });

  it('713 the photo badge: a walk-in photo on a photo badge location; never for a visitor under 18; the name badge without a photo', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    const images = (b: Buffer) => ((b.toString('latin1').match(/\/Subtype \/Image/g) ?? []).length);
    const photoPath = await blob.upload(`visitors/${org.A.id}/badge-${run}.png`, png, 'image/png');
    const make = async (name: string, minor: boolean) => {
      const v = (await api('host', 'post', '/visitors/invites').send(invite({ name, email: `${name.split(' ')[0]!.toLowerCase()}-${run}@visitor.test`, ...(minor ? { minor: true, minorAdult: 'Lakshmi Rao' } : {}) })).expect(want(201))).body;
      await inA((tx) => tx.visit.update({ where: { id: v.id }, data: { photoPath } }));
      await api('reception', 'post', `/visitors/${v.id}/check-in`).send({ noticeAccepted: true, ...(minor ? { adultPresent: true } : {}) }).expect(want(200));
      return v.id as string;
    };
    const adult = await make('Neha Joshi', false);
    const kid = await make('Arjun Rao', true);
    const badge = async (id: string) => images((await binary(api('reception', 'get', `/visitors/${id}/badge.pdf`)).expect(want(200))).body as Buffer);
    const nameOnly = await badge(adult);
    await api('admin', 'put', '/org/settings').send({ key: 'visitors.badge', scopeType: 'location', scopeId: ids.maa, value: 'photo_qr' }).expect(want(200));
    expect(await badge(adult)).toBeGreaterThan(nameOnly);
    expect(await badge(kid)).toBe(nameOnly);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'visitor.badge_printed', entityId: adult, metadataJson: { contains: '"photo":true' } } }))).toBe(1);
    await api('admin', 'put', '/org/settings').send({ key: 'visitors.badge', scopeType: 'location', scopeId: ids.maa, value: 'name_qr' }).expect(want(200));
    for (const id of [adult, kid]) await api('reception', 'post', `/visitors/${id}/check-out`).expect(want(200));
  });
});
