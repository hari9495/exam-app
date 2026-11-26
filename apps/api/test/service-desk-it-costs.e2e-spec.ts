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
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// GLPI 7 (answer 2719), against the real database (forced RLS, the app role). On an IT desk a ticket's cost is its logged
// time at its team's hourly rate (kept on each entry, so a later rate change never rewrites it) plus fixed and material
// cost lines, each charged to the requester's department. Each department has a yearly IT budget with spent and left,
// set and seen only with desk.budget.manage (Service Desk Admin, company admin). Other desks have no costs; another
// company never sees these.
describe('Helpdesk: IT costs into department budgets (2719)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'sdAdmin' | 'itAgent' | 'itAgent2' | 'hrAgent' | 'emp';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const fy = Number(today.slice(5, 7)) >= 4 ? Number(today.slice(0, 4)) : Number(today.slice(0, 4)) - 1;
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const costs = async (who: Who, id: string) => (await api(who, 'get', `/desk/tickets/${id}`).expect(200)).body.costs;
  const engRow = async () => ((await api('sdAdmin', 'get', '/desk/it-budgets').expect(200)).body.rows as { departmentId: string }[]).find((r) => r.departmentId === ids.deptA);

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

    ids.plan = (await prisma.plan.create({ data: { name: `itc-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ITC Org ${k}`, slug: `itc-${k.toLowerCase()}-${run}`, planId: ids.plan } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['sdAdmin', 'A', 'panel', tpl('service_desk_admin')],
      ['itAgent', 'A', 'panel', tpl('desk_agent')],
      ['itAgent2', 'A', 'panel', tpl('desk_agent')],
      ['hrAgent', 'A', 'panel', tpl('desk_agent')],
      ['emp', 'A', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await inOrg(o, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `p-${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@itc-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@itc-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      const o = org[k].id;
      await inOrg(o, async (tx) => {
        const base = { organizationId: o };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...base, name: `ITC Foods ${k}`, shortName: `ITC${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...base, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const id = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...base, id, name: 'ENG', code: 'ENG', path: `/${id}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...base, name: 'Engineer', code: 'ENGR' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...base, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const empId = (
      await api('adminA', 'post', '/people/employees')
        .send({ legalEntityId: ids.entityA, status: 'confirmed', reason: 'Joined', givenName: 'emp', familyName: run, joinedOn: today, userId: users.emp, workEmail: `emp@itc-${run}.test`, assignment: { locationId: ids.locA, departmentId: ids.deptA, designationId: ids.desigA, employmentTypeId: ids.permA } })
        .expect(201)
    ).body.id as string;
    ids.empPerson = (await inOrg(org.A.id, (tx) => tx.employee.findUniqueOrThrow({ where: { id: empId }, select: { personId: true } }))).personId;

    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help', key: 'IT', kind: 'it' }).expect(201)).body.id;
    ids.hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help', key: 'HR', kind: 'hr' }).expect(201)).body.id;
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.itAgent, role: 'agent' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.itAgent2, role: 'agent' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.hr}/members`).send({ userId: users.hrAgent, role: 'agent' }).expect(201);
    ids.group = (await api('adminA', 'get', `/desk/desks/${ids.it}`).expect(200)).body.groups[0].id;
    const t = (await api('itAgent', 'post', '/desk/tickets').send({ deskId: ids.it, requesterPersonId: ids.empPerson, subject: 'Laptop screen cracked', bodyHtml: '<p>cracked</p>' }).expect(201)).body;
    ids.ticket = t.id;
    const v = (await api('itAgent', 'get', `/desk/tickets/${t.id}`).expect(200)).body.version;
    await api('itAgent', 'patch', `/desk/tickets/${t.id}`).send({ version: v, groupId: ids.group }).expect(200);
    ids.hrTicket = (await api('hrAgent', 'post', '/desk/tickets').send({ deskId: ids.hr, requesterPersonId: ids.empPerson, subject: 'Payslip query', bodyHtml: '<p>q</p>' }).expect(201)).body.id;
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
    await prisma.plan.delete({ where: { id: ids.plan } }).catch(() => undefined);
    await app.close();
  });

  it('the team hourly rate is set on the group; time logged is costed at it and charged to the requester\'s department', async () => {
    await api('adminA', 'patch', `/desk/desks/${ids.it}/groups/${ids.group}`).send({ name: 'IT help team', assignmentMethod: 'manual', memberIds: [users.itAgent, users.itAgent2], hourlyRate: '600' }).expect(200);
    expect((await api('adminA', 'get', `/desk/desks/${ids.it}`).expect(200)).body.groups[0]).toMatchObject({ hourlyRate: '600.00' });
    await api('itAgent', 'post', `/desk/tickets/${ids.ticket}/time-entries`).send({ minutes: 30, note: 'Diagnosed' }).expect(201);
    expect(await costs('itAgent', ids.ticket)).toMatchObject({ hourlyRate: '600.00', timeCost: '300.00', uncostedMinutes: 0, lines: [], total: '300.00', departments: ['ENG'] });
  });

  it('negative: a bad rate is refused; a later rate change never rewrites time already logged', async () => {
    await api('adminA', 'patch', `/desk/desks/${ids.it}/groups/${ids.group}`).send({ name: 'IT help team', assignmentMethod: 'manual', memberIds: [users.itAgent], hourlyRate: '-5' }).expect(400);
    await api('adminA', 'patch', `/desk/desks/${ids.it}/groups/${ids.group}`).send({ name: 'IT help team', assignmentMethod: 'manual', memberIds: [users.itAgent, users.itAgent2], hourlyRate: '1000' }).expect(200);
    expect(await costs('itAgent', ids.ticket)).toMatchObject({ hourlyRate: '1000.00', timeCost: '300.00' });
  });

  it('fixed and material cost lines add to the total; whoever added one, or a lead, takes it off with a reason (kept)', async () => {
    const line = (await api('itAgent', 'post', `/desk/tickets/${ids.ticket}/costs`).send({ kind: 'material', description: 'Replacement screen', amount: '4500' }).expect(201)).body;
    const fee = (await api('itAgent', 'post', `/desk/tickets/${ids.ticket}/costs`).send({ kind: 'fixed', description: 'Courier', amount: '250.50' }).expect(201)).body;
    expect(await costs('itAgent', ids.ticket)).toMatchObject({ total: '5050.50', lines: [expect.objectContaining({ id: line.id, kind: 'material', amount: '4500.00', canRemove: true }), expect.objectContaining({ id: fee.id, kind: 'fixed', amount: '250.50' })] });
    // Another agent did not add it and is not a lead.
    expect((await costs('itAgent2', ids.ticket)).lines[0].canRemove).toBe(false);
    await api('itAgent2', 'post', `/desk/tickets/${ids.ticket}/costs/${fee.id}/remove`).send({ reason: 'Not ours' }).expect(403);
    await api('itAgent', 'post', `/desk/tickets/${ids.ticket}/costs/${fee.id}/remove`).send({ reason: 'Courier paid by the vendor' }).expect(201);
    await api('itAgent', 'post', `/desk/tickets/${ids.ticket}/costs/${fee.id}/remove`).send({ reason: 'Again' }).expect(404);
    // 2811: the removed line stays listed for the desk's agents, with who took it off and why; the total leaves it out.
    expect(await costs('itAgent2', ids.ticket)).toMatchObject({
      total: '4800.00',
      lines: [
        expect.objectContaining({ id: line.id, removed: null }),
        expect.objectContaining({ id: fee.id, canRemove: false, removed: { by: `itAgent ${run}`, on: today, reason: 'Courier paid by the vendor' } }),
      ],
    });
    const kept = await inOrg(org.A.id, (tx) => tx.sdCostLine.findUniqueOrThrow({ where: { id: fee.id } }));
    expect(kept).toMatchObject({ removedBy: users.itAgent, removeReason: 'Courier paid by the vendor' });
  });

  it('2810: a cost line keeps the date chosen (today, the day the ticket was opened); the card says when the ticket was opened', async () => {
    const dated = (await api('itAgent', 'post', `/desk/tickets/${ids.ticket}/costs`).send({ kind: 'fixed', description: 'Data cable', amount: '120', costOn: today }).expect(201)).body;
    const c = await costs('itAgent', ids.ticket);
    expect(c.openedOn).toBe(today);
    expect(c.lines.find((l: { id: string }) => l.id === dated.id)).toMatchObject({ costOn: today, removed: null });
    await api('itAgent', 'post', `/desk/tickets/${ids.ticket}/costs/${dated.id}/remove`).send({ reason: 'Test line' }).expect(201);
  });

  it('negative: a bad kind, amount or future date is refused; other desks record no costs and show none', async () => {
    const add = (body: object) => api('itAgent', 'post', `/desk/tickets/${ids.ticket}/costs`).send(body);
    await add({ kind: 'travel', description: 'Cab', amount: '100' }).expect(400);
    await add({ kind: 'fixed', description: 'Cab', amount: '-100' }).expect(400);
    await add({ kind: 'fixed', description: 'Cab', amount: '1e5' }).expect(400);
    await add({ kind: 'fixed', description: 'Cab', amount: '100', costOn: '2999-01-01' }).expect(400);
    // 2810: not before the ticket was opened (it was opened today).
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    expect((await add({ kind: 'fixed', description: 'Cab', amount: '100', costOn: yesterday }).expect(400)).body.message).toMatch(/before the ticket was opened/);
    await add({ kind: 'fixed', description: 'Cab', amount: '100', costOn: 'not-a-date' }).expect(400);
    await api('hrAgent', 'post', `/desk/tickets/${ids.hrTicket}/costs`).send({ kind: 'fixed', description: 'Cab', amount: '100' }).expect(400);
    expect(await costs('hrAgent', ids.hrTicket)).toBeUndefined();
    // An agent of another desk cannot add costs to this IT ticket.
    expect([403, 404]).toContain((await api('hrAgent', 'post', `/desk/tickets/${ids.ticket}/costs`).send({ kind: 'fixed', description: 'Cab', amount: '100' })).status);
    // 2811: removed lines (with who and why) are only in the agents' view; the requester's own view carries no costs.
    expect((await api('emp', 'get', `/desk/my/tickets/${ids.ticket}`).expect(200)).body.costs).toBeUndefined();
  });

  it('a department\'s yearly IT budget shows spent (time and lines) and left', async () => {
    expect(await engRow()).toMatchObject({ department: 'ENG', budget: null, time: '300.00', lines: '4500.00', spent: '4800.00', left: null });
    await api('sdAdmin', 'put', '/desk/it-budgets').send({ departmentId: ids.deptA, year: fy, amount: '100000' }).expect(200);
    expect(await engRow()).toMatchObject({ budget: '100000.00', spent: '4800.00', left: '95200.00' });
    // The company admin holds the key too; next year starts empty.
    expect((await api('adminA', 'get', `/desk/it-budgets?year=${fy + 1}`).expect(200)).body).toMatchObject({ year: fy + 1, rows: [] });
  });

  it('negative: without desk.budget.manage no budgets; bad values and another company\'s department are refused; company B sees nothing of A', async () => {
    await api('itAgent', 'get', '/desk/it-budgets').expect(403);
    await api('itAgent', 'put', '/desk/it-budgets').send({ departmentId: ids.deptA, year: fy, amount: '1' }).expect(403);
    await api('emp', 'get', '/desk/it-budgets').expect(403);
    await api('sdAdmin', 'put', '/desk/it-budgets').send({ departmentId: ids.deptA, year: fy, amount: '-1' }).expect(400);
    await api('sdAdmin', 'put', '/desk/it-budgets').send({ departmentId: ids.deptA, year: 1999, amount: '1' }).expect(400);
    await api('sdAdmin', 'put', '/desk/it-budgets').send({ departmentId: ids.deptB, year: fy, amount: '1' }).expect(400);
    await api('adminB', 'put', '/desk/it-budgets').send({ departmentId: ids.deptA, year: fy, amount: '1' }).expect(400);
    expect((await api('adminB', 'get', '/desk/it-budgets').expect(200)).body).toMatchObject({ rows: [], noDepartment: null });
    expect(await engRow()).toMatchObject({ budget: '100000.00' });
  });
});
