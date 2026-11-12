process.env.SD_SCANNER = 'dev-fake';
process.env.APPROVAL_CHANNELS = 'dev-fake';
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
import { STARTER_PACKS } from '../src/service-desk/starter';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Helpdesk items 1 and 2 (founder, 12 Nov 2026), against the real database (forced RLS, the app role). A new IT desk gets
// the IT starter catalogue (laptop, software and VPN with the manager's approval, password reset, the joiner's IT kit
// for journeys only) and its targets; other desk kinds are unchanged. Devices come from the People asset register: a
// requester picks only the devices assigned to them now, an IT desk agent searches the company's, no one else does, and
// another company's are never returned. A picked device shows on the ticket, and the agent sees the requester's devices.
describe('Helpdesk: IT starter catalogue and devices on a ticket', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'itAgent' | 'hrAgent' | 'emp' | 'other' | 'empB' | 'agentB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const labels = (rows: { label: string }[]) => rows.map((r) => r.label).sort();

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

    ids.plan = (await prisma.plan.create({ data: { name: `it-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `IT Org ${k}`, slug: `it-${k.toLowerCase()}-${run}`, planId: ids.plan } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['itAgent', 'A', 'panel', tpl('desk_agent')],
      ['hrAgent', 'A', 'panel', tpl('desk_agent')],
      ['emp', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
      ['agentB', 'B', 'panel', tpl('desk_agent')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await inOrg(o, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `p-${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@it-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@it-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      const o = org[k].id;
      await inOrg(o, async (tx) => {
        const base = { organizationId: o };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...base, name: `IT Foods ${k}`, shortName: `IT${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...base, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const id = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...base, id, name: 'ENG', code: 'ENG', path: `/${id}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...base, name: 'Engineer', code: 'ENGR' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...base, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const hire = async (k: 'A' | 'B', who: Who) => {
      const empId = (
        await api(k === 'A' ? 'adminA' : 'adminB', 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[who], workEmail: `${who}@it-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: null } })
          .expect(201)
      ).body.id as string;
      return (await inOrg(org[k].id, (tx) => tx.employee.findUniqueOrThrow({ where: { id: empId }, select: { personId: true } }))).personId;
    };
    ids.empPerson = await hire('A', 'emp');
    ids.otherPerson = await hire('A', 'other');
    ids.empBPerson = await hire('B', 'empB');
    // The People asset register: a laptop each for emp and other, one in stock, one retired; in company B a laptop for empB.
    const asset = (k: 'A' | 'B', name: string, tag: string, status: string, holder?: string) =>
      inOrg(org[k].id, async (tx) => {
        const a = await tx.asset.create({ data: { organizationId: org[k].id, category: 'Laptop', name, tag, status } });
        if (holder) await tx.assetAssignment.create({ data: { organizationId: org[k].id, assetId: a.id, personId: holder, issuedOn: new Date(`${today}T00:00:00Z`), issueCondition: 'Good' } });
        return a.id;
      });
    ids.empLaptop = await asset('A', 'Dell Latitude 5440', `KF-LT-${run}-1`, 'assigned', ids.empPerson);
    ids.otherLaptop = await asset('A', 'Lenovo ThinkPad E14', `KF-LT-${run}-2`, 'assigned', ids.otherPerson);
    ids.spare = await asset('A', 'HP ProBook 440', `KF-LT-${run}-3`, 'in_stock');
    ids.retired = await asset('A', 'Old Inspiron', `KF-LT-${run}-4`, 'retired');
    ids.bLaptop = await asset('B', 'Dell Latitude 7440', `KF-LT-${run}-B`, 'assigned', ids.empBPerson);

    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help', key: 'IT', kind: 'it' }).expect(201)).body.id;
    ids.hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help', key: 'HR', kind: 'hr' }).expect(201)).body.id;
    ids.adm = (await api('adminA', 'post', '/desk/desks').send({ name: 'Admin help', key: 'AD', kind: 'admin' }).expect(201)).body.id;
    ids.itB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.itAgent, role: 'agent' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.hr}/members`).send({ userId: users.hrAgent, role: 'agent' }).expect(201);
    await api('adminB', 'post', `/desk/desks/${ids.itB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: ids.plan } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ item 1: IT starter catalogue

  it('a new IT desk gets the IT starter items with their tasks, the manager approving laptop, software and VPN, and its targets', async () => {
    const items = await inOrg(org.A.id, (tx) => tx.sdCatalogItem.findMany({ where: { deskId: ids.it }, select: { id: true, name: true, journeyOnly: true, deliveryDays: true } }));
    expect(items.map((i) => i.name).sort()).toEqual(['New laptop', 'New-joiner IT kit', 'Password reset', 'Software install', 'VPN access']);
    expect(items.find((i) => i.name === 'New-joiner IT kit')!.journeyOnly).toBe(true);
    const versions = await inOrg(org.A.id, (tx) => tx.sdCatalogItemVersion.findMany({ where: { itemId: { in: items.map((i) => i.id) } }, select: { itemId: true, approval: true, fulfilment: true } }));
    const of = (name: string) => versions.find((v) => v.itemId === items.find((i) => i.name === name)!.id)!;
    for (const n of ['New laptop', 'Software install', 'VPN access']) expect([n, (of(n).approval as { name: string }[]).map((s) => s.name)]).toEqual([n, ['Manager']]);
    expect(of('Password reset').approval).toEqual([]);
    expect((of('New laptop').fulfilment as { title: string }[]).map((t) => t.title)).toEqual(['Take a laptop from stock or order one', 'Set up the laptop and hand it over']);
    const sla = await inOrg(org.A.id, (tx) => tx.sdSlaPolicyVersion.findFirstOrThrow({ where: { deskId: ids.it } }));
    expect(sla.targets).toEqual([{ metric: 'first_response', minutes: STARTER_PACKS.it!.firstResponse }, { metric: 'resolution', minutes: STARTER_PACKS.it!.resolution }]);
    // Journey-only items never show in the catalogue.
    const catalogue = (await api('emp', 'get', '/desk/my/catalog').expect(200)).body.items.map((i: { name: string }) => i.name);
    expect(catalogue).toEqual(expect.arrayContaining(['New laptop', 'Software install', 'VPN access', 'Password reset']));
    expect(catalogue).not.toContain('New-joiner IT kit');
  });

  it('negative: other desk kinds are unchanged (HR and Admin keep their own items, nothing from IT)', async () => {
    const names = async (desk: string) => (await inOrg(org.A.id, (tx) => tx.sdCatalogItem.findMany({ where: { deskId: desk }, select: { name: true } }))).map((i) => i.name).sort();
    expect(await names(ids.hr)).toEqual(STARTER_PACKS.hr!.items.map((i) => i.name).sort());
    expect(await names(ids.adm)).toEqual(STARTER_PACKS.admin!.items.map((i) => i.name).sort());
  });

  // ------------------------------------------------------------------------------------------ item 2: devices

  it('a requester picks only the devices assigned to them now', async () => {
    expect(labels((await api('emp', 'get', '/desk/my/pick/assets').expect(200)).body)).toEqual([`Dell Latitude 5440 (KF-LT-${run}-1)`]);
    expect(labels((await api('other', 'get', '/desk/my/pick/assets').expect(200)).body)).toEqual([`Lenovo ThinkPad E14 (KF-LT-${run}-2)`]);
    expect((await api('emp', 'get', '/desk/my/pick/assets?q=Lenovo').expect(200)).body).toEqual([]);
  });

  it('negative: another company never sees these devices, and these never see theirs', async () => {
    expect(labels((await api('empB', 'get', '/desk/my/pick/assets').expect(200)).body)).toEqual([`Dell Latitude 7440 (KF-LT-${run}-B)`]);
    const b = (await api('agentB', 'get', `/desk/pick/assets?deskId=${ids.itB}&q=KF-LT-${run}`).expect(200)).body as { id: string }[];
    expect(b.map((x) => x.id)).toEqual([ids.bLaptop]);
    await api('agentB', 'get', `/desk/pick/assets?deskId=${ids.it}`).expect(403);
  });

  it('an IT desk agent searches the company\'s devices by tag or name (not retired or lost ones)', async () => {
    const all = (await api('itAgent', 'get', `/desk/pick/assets?deskId=${ids.it}&q=KF-LT-${run}`).expect(200)).body as { id: string }[];
    expect(all.map((x) => x.id).sort()).toEqual([ids.empLaptop, ids.otherLaptop, ids.spare].sort());
    expect(((await api('itAgent', 'get', `/desk/pick/assets?deskId=${ids.it}&q=ProBook`).expect(200)).body as { id: string }[]).map((x) => x.id)).toEqual([ids.spare]);
  });

  it('negative: an agent of another desk (HR) cannot search all devices, on their desk or the IT desk; a requester has no agent search', async () => {
    expect((await api('hrAgent', 'get', `/desk/pick/assets?deskId=${ids.hr}`).expect(403)).body.message).toMatch(/IT desk/);
    await api('hrAgent', 'get', `/desk/pick/assets?deskId=${ids.it}`).expect(403);
    await api('emp', 'get', `/desk/pick/assets?deskId=${ids.it}`).expect(403);
  });

  it('a device picked on a form shows on the ticket; someone else\'s device is refused; the agent sees the requester\'s devices', async () => {
    // The desk adds a device question to "Password reset" and publishes it (catalogue set-up, version 2).
    const item = await inOrg(org.A.id, (tx) => tx.sdCatalogItem.findFirstOrThrow({ where: { deskId: ids.it, name: 'Password reset' } }));
    const form = { sections: [{ id: 's1', columns: 1, fields: [{ key: 'device', type: 'asset', label: 'Which device', required: true }] }], rules: [] };
    const admin = (await api('adminA', 'get', `/desk/catalog/admin/items/${item.id}`).expect(200)).body as { version: number; draft: Record<string, unknown> };
    const saved = (await request(app.getHttpServer()).patch(`/api/v1/desk/catalog/admin/items/${item.id}`).set('Authorization', `Bearer ${token.adminA}`).send({ version: admin.version, draft: { ...admin.draft, form } }).expect(200)).body as { version: number };
    await api('adminA', 'post', `/desk/catalog/admin/items/${item.id}/publish`).send({ version: saved.version }).expect(200);
    const bad = await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: item.id, quantity: 1, answers: { device: ids.otherLaptop } }] }).expect(400);
    expect(JSON.stringify(bad.body.errors)).toMatch(/your own devices/);
    const done = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: item.id, quantity: 1, answers: { device: ids.empLaptop } }] }).expect(201)).body as { requests: { ticketId: string }[] };
    const ticketId = done.requests[0]!.ticketId;
    const mine = (await api('emp', 'get', `/desk/my/tickets/${ticketId}`).expect(200)).body as { messages: { bodyHtml: string }[] };
    expect(mine.messages.map((m) => m.bodyHtml).join('')).toContain(`Dell Latitude 5440 (KF-LT-${run}-1)`);
    const ctx = (await api('itAgent', 'get', `/desk/tickets/${ticketId}/context`).expect(200)).body as { assets: { id: string; tag: string }[] };
    expect(ctx.assets.map((x) => x.id)).toEqual([ids.empLaptop]);
    await api('hrAgent', 'get', `/desk/tickets/${ticketId}/context`).expect((r) => expect([403, 404]).toContain(r.status));
  });
});
