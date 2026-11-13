process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { RecurringService } from '../src/service-desk/recurring.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Helpdesk plan item 4: buildings, areas and equipment; the place a facilities work order names; recurring maintenance
// on a piece of equipment; the equipment page's work-order history. Positive and negative.
describe('Helpdesk: buildings, equipment and maintenance', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'facAdmin' | 'facAgent' | 'itAdmin' | 'divya';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const equipment = (over: Record<string, unknown> = {}) => ({ deskId: ids.fac, ownerGroupId: ids.facTeam, locationId: ids.blr, areaId: ids.floor2, name: 'Passenger lift', tag: `LIFT-${run}`, category: 'Lift', ...over });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue({ success: true }) })
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

    planId = (await prisma.plan.create({ data: { name: `fac-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Fac Org ${k}`, slug: `fac-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['facAdmin', 'A', 'panel', 'desk_admin'],
      ['facAgent', 'A', 'panel', 'desk_agent'],
      ['itAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@fac.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@fac.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const base = { organizationId: org.A.id };
      const le = await tx.legalEntity.create({ data: { ...base, name: `Fac Foods ${run}`, shortName: `FF-${run}`, isDefault: true } });
      ids.blr = (await tx.location.create({ data: { ...base, legalEntityId: le.id, name: 'Bengaluru office', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      ids.che = (await tx.location.create({ data: { ...base, legalEntityId: le.id, name: 'Chennai plant', code: 'CHE', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const p = await tx.person.create({ data: { ...base, givenName: 'Divya', primaryEmail: `divya-${run}@fac.test` } });
      await tx.personRole.create({ data: { ...base, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.fac = (await api('adminA', 'post', '/desk/desks').send({ name: 'Facilities', key: 'FAC', kind: 'facilities' }).expect(201)).body.id;
    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, desk, role] of [['facAdmin', ids.fac, 'admin'], ['facAgent', ids.fac, 'agent'], ['facAgent', ids.it, 'agent'], ['itAdmin', ids.it, 'admin']] as const) await api('adminA', 'post', `/desk/desks/${desk}/members`).send({ userId: users[who], role }).expect(201);
    ids.facTeam = (await api('adminA', 'get', `/desk/desks/${ids.fac}`).expect(200)).body.groups[0].id;
    ids.itTeam = (await api('adminA', 'get', `/desk/desks/${ids.it}`).expect(200)).body.groups[0].id;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only a facilities desk admin changes the register (areas, equipment, retire); it is audited', async () => {
    ids.floor2 = (await api('facAdmin', 'post', '/desk/facilities/areas').send({ locationId: ids.blr, name: '2nd floor' }).expect(201)).body.id;
    await api('facAdmin', 'post', '/desk/facilities/areas').send({ locationId: ids.blr, name: '2ND FLOOR' }).expect(409);
    ids.lift = (await api('facAdmin', 'post', '/desk/facilities/equipment').send(equipment()).expect(201)).body.id;
    ids.gen = (await api('facAdmin', 'post', '/desk/facilities/equipment').send(equipment({ name: 'Generator', tag: `DG-${run}`, locationId: ids.che, areaId: null, category: 'Generator' })).expect(201)).body.id;
    ids.oldAc = (await api('facAdmin', 'post', '/desk/facilities/equipment').send(equipment({ name: 'Old AC', tag: `AC-${run}`, category: 'Air conditioner' })).expect(201)).body.id;
    await api('facAdmin', 'patch', `/desk/facilities/equipment/${ids.oldAc}`).send(equipment({ name: 'Old AC', tag: `AC-${run}`, status: 'retired', version: 1 })).expect(200);
    // Negative: the same tag, an area of another building, a team of another desk.
    await api('facAdmin', 'post', '/desk/facilities/equipment').send(equipment({ name: 'Copy' })).expect(409);
    expect((await api('facAdmin', 'post', '/desk/facilities/equipment').send(equipment({ tag: `X1-${run}`, locationId: ids.che })).expect(400)).body.message).toMatch(/area of that building/);
    expect((await api('facAdmin', 'post', '/desk/facilities/equipment').send(equipment({ tag: `X2-${run}`, ownerGroupId: ids.itTeam })).expect(400)).body.message).toMatch(/team of this facilities desk/);
    // Negative: an agent, another desk's admin and the company admin without a facilities admin seat may not change it.
    await api('facAgent', 'post', '/desk/facilities/equipment').send(equipment({ tag: `X3-${run}` })).expect(403);
    expect((await api('itAdmin', 'post', '/desk/facilities/areas').send({ locationId: ids.che, name: 'Ground' }).expect(403)).body.message).toMatch(/facilities desk/);
    await api('adminA', 'post', '/desk/facilities/areas').send({ locationId: ids.che, name: 'Ground' }).expect(403);
    await api('itAdmin', 'post', '/desk/facilities/equipment').send(equipment({ deskId: ids.it, ownerGroupId: ids.itTeam, tag: `X4-${run}` })).expect(403);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: { in: ['desk.facility_area.created', 'desk.equipment.created', 'desk.equipment.updated'] } } }))).toBe(5);
  });

  it('the staff read it; retired equipment cannot be picked; one company never sees another\'s', async () => {
    const reg = (await api('facAgent', 'get', '/desk/facilities').expect(200)).body;
    expect(reg.canEdit).toBe(false);
    expect(reg.equipment.map((e: { name: string; status: string }) => [e.name, e.status])).toEqual([['Generator', 'active'], ['Passenger lift', 'active'], ['Old AC', 'retired']]);
    const picked = (await api('facAgent', 'get', '/desk/facilities/pick?kind=equipment&q=').expect(200)).body.map((x: { id: string }) => x.id);
    expect(picked.sort()).toEqual([ids.gen, ids.lift].sort());
    expect((await api('facAgent', 'get', `/desk/facilities/pick?kind=areas&q=&locationId=${ids.blr}`).expect(200)).body.map((x: { id: string }) => x.id)).toEqual([ids.floor2]);
    await api('divya', 'get', '/desk/facilities').expect(403);
    const b = (await api('adminB', 'get', '/desk/facilities').expect(200)).body;
    expect(b.equipment).toEqual([]);
    expect(b.buildings).toEqual([]);
    await api('adminB', 'get', `/desk/facilities/equipment/${ids.lift}`).expect(404);
    expect((await api('adminB', 'get', '/desk/facilities/pick?kind=equipment&q=').expect(200)).body).toEqual([]);
    await api('adminB', 'patch', `/desk/facilities/equipment/${ids.lift}`).send(equipment({ status: 'retired' })).expect(404);
  });

  it('a facilities work order names the equipment (its building and area come with it); retired equipment and other desks are refused', async () => {
    const id = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.fac, subject: `Lift noisy ${run}`, description: 'It squeaks.' }).expect(201)).body.id;
    expect(await api('facAgent', 'put', `/desk/tickets/${id}/place`).send({ equipmentId: ids.lift }).expect(200).then((r) => r.body)).toEqual({ locationId: ids.blr, areaId: ids.floor2, equipmentId: ids.lift });
    const view = (await api('facAgent', 'get', `/desk/tickets/${id}`).expect(200)).body;
    expect(view).toMatchObject({ canSetPlace: true, place: { building: { id: ids.blr }, area: { id: ids.floor2 }, equipment: { id: ids.lift } } });
    expect((await api('facAgent', 'put', `/desk/tickets/${id}/place`).send({ equipmentId: ids.oldAc }).expect(400)).body.message).toMatch(/retired/);
    expect((await api('facAgent', 'put', `/desk/tickets/${id}/place`).send({ locationId: ids.che, areaId: ids.floor2 }).expect(400)).body.message).toMatch(/area of that building/);
    const itTicket = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `Laptop ${run}`, description: 'x' }).expect(201)).body.id;
    await api('facAgent', 'put', `/desk/tickets/${itTicket}/place`).send({ equipmentId: ids.lift }).expect(403);
    ids.liftTicket = id;
  });

  it('recurring maintenance on equipment makes one ticket per due date naming it; the equipment page shows its work orders', async () => {
    const start = new Date(Date.now() + 86_400_000);
    start.setUTCHours(4, 30, 0, 0);
    await api('facAdmin', 'post', '/desk/recurring').send({ deskId: ids.fac, name: `Lift service ${run}`, rrule: 'FREQ=DAILY', timeZone: 'Asia/Kolkata', startsAt: start.toISOString(), template: { subject: 'Lift daily check', bodyHtml: '<p>Check the lift.</p>', equipmentId: ids.oldAc } }).expect(400);
    const sched = (await api('facAdmin', 'post', '/desk/recurring').send({ deskId: ids.fac, name: `Lift service ${run}`, rrule: 'FREQ=DAILY', timeZone: 'Asia/Kolkata', startsAt: start.toISOString(), template: { subject: 'Lift daily check', bodyHtml: '<p>Check the lift.</p>', equipmentId: ids.lift } }).expect(201)).body;
    const job = app.get(RecurringService);
    const later = new Date(start.getTime() + 2 * 86_400_000 + 3_600_000);
    await job.tick(later);
    await job.tick(later);
    const made = await inA((tx) => tx.sdTicket.findMany({ where: { deskId: ids.fac, equipmentId: ids.lift, tags: { has: 'recurring' } }, select: { id: true, locationId: true, areaId: true } }));
    const runs = await inA((tx) => tx.sdRecurringRun.findMany({ where: { recurringId: sched.id } }));
    expect(runs).toHaveLength(3);
    expect(made).toHaveLength(3);
    expect(new Set(runs.map((r) => r.ticketId))).toEqual(new Set(made.map((t) => t.id)));
    expect(made.every((t) => t.locationId === ids.blr && t.areaId === ids.floor2)).toBe(true);
    const page = (await api('facAgent', 'get', `/desk/facilities/equipment/${ids.lift}`).expect(200)).body;
    expect(page.workOrders).toHaveLength(4);
    expect(page.workOrders.filter((w: { recurring: boolean }) => w.recurring)).toHaveLength(3);
    expect(page.maintenance.map((m: { id: string }) => m.id)).toEqual([sched.id]);
  });

  it('retired equipment pauses its maintenance instead of making tickets', async () => {
    const start = new Date(Date.now() + 86_400_000);
    start.setUTCHours(5, 0, 0, 0);
    const sched = (await api('facAdmin', 'post', '/desk/recurring').send({ deskId: ids.fac, name: `DG service ${run}`, rrule: 'FREQ=DAILY', timeZone: 'Asia/Kolkata', startsAt: start.toISOString(), template: { subject: 'DG check', bodyHtml: '<p>Check the generator.</p>', equipmentId: ids.gen } }).expect(201)).body;
    const gen = (await api('facAdmin', 'get', '/desk/facilities').expect(200)).body.equipment.find((e: { id: string }) => e.id === ids.gen);
    await api('facAdmin', 'patch', `/desk/facilities/equipment/${ids.gen}`).send(equipment({ name: 'Generator', tag: `DG-${run}`, locationId: ids.che, areaId: null, category: 'Generator', status: 'retired', version: gen.version })).expect(200);
    await app.get(RecurringService).tick(new Date(start.getTime() + 3_600_000));
    expect(await inA((tx) => tx.sdTicket.count({ where: { equipmentId: ids.gen } }))).toBe(0);
    expect((await inA((tx) => tx.sdRecurring.findFirstOrThrow({ where: { id: sched.id } }))).state).toBe('paused');
  });
  it('1914: the equipment page lists 25 work orders and "show more" brings the older ones, newest first, without repeats', async () => {
    // 26 more work orders for the lift (copies of its first, an hour apart and older): 30 in all.
    await inA(async (tx) => {
      const src = await tx.sdTicket.findFirstOrThrow({ where: { id: ids.liftTicket } });
      const { id: _id, seq, number: _n, createdAt, ...rest } = src;
      for (let i = 1; i <= 26; i++) await tx.sdTicket.create({ data: { ...rest, fieldValues: rest.fieldValues ?? {}, custom: rest.custom ?? undefined, seq: seq + BigInt(100 + i), number: `FAC-H${i}-${run}`, subject: `History ${i}`, createdAt: new Date(createdAt.getTime() - i * 3_600_000) } as never });
    });
    const page = (await api('facAgent', 'get', `/desk/facilities/equipment/${ids.lift}`).expect(200)).body as { workOrders: { id: string; createdAt: string }[]; moreWorkOrders: boolean };
    expect(page.workOrders).toHaveLength(25);
    expect(page.moreWorkOrders).toBe(true);
    const next = (await api('facAgent', 'get', `/desk/facilities/equipment/${ids.lift}/work-orders?after=${page.workOrders[24].id}`).expect(200)).body as { items: { id: string; createdAt: string }[]; more: boolean };
    expect(next.items).toHaveLength(5);
    expect(next.more).toBe(false);
    const all = [...page.workOrders, ...next.items];
    expect(new Set(all.map((w) => w.id)).size).toBe(30);
    expect(all.map((w) => w.createdAt)).toEqual([...all.map((w) => w.createdAt)].sort().reverse());
  });

  it('1914 negative: a cursor that is not one of its work orders, another company, and someone without a desk seat are refused', async () => {
    await api('facAgent', 'get', `/desk/facilities/equipment/${ids.lift}/work-orders?after=${randomUUID()}`).expect(400);
    const itTicket = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `Other ${run}`, description: 'x' }).expect(201)).body.id;
    await api('facAgent', 'get', `/desk/facilities/equipment/${ids.lift}/work-orders?after=${itTicket}`).expect(400);
    await api('facAgent', 'get', `/desk/facilities/equipment/${ids.lift}/work-orders?after=not-a-uuid`).expect(400);
    await api('adminB', 'get', `/desk/facilities/equipment/${ids.lift}/work-orders?after=${ids.liftTicket}`).expect(404);
    await api('divya', 'get', `/desk/facilities/equipment/${ids.lift}/work-orders?after=${ids.liftTicket}`).expect(403);
  });
});
