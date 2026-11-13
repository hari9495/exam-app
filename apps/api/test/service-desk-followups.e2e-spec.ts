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

// Helpdesk follow-ups (founder 13 Nov 2026, "all ok"): 1842, 1843, 1844, 1846, 1891, 1894, 1911, 1913, 1914, end to end
// against the real database (forced RLS, the app role). Positive and negative for each.
describe('Helpdesk follow-ups', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'deskAdmin' | 'divya' | 'agentB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: null });
  const ticketsOf = (subject: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.count({ where: { organizationId: org.A.id, subject } }));
  const OFFICE = { key: 'office', label: 'Office', fieldType: 'choice', options: [{ value: 'blr', label: 'Bengaluru' }, { value: 'che', label: 'Chennai' }], visibility: 'all' };
  const FLOOR = { key: 'floor', label: 'Floor', fieldType: 'choice', options: [{ value: 'b1', label: 'BLR 1' }, { value: 'c1', label: 'CHE G' }], dependsOn: 'office', optionsBy: { blr: ['b1'], che: ['c1'] }, visibility: 'all' };
  const VENDOR = { key: 'vendor_ref', label: 'Vendor ref', fieldType: 'text', visibility: 'agents' };
  const COST = { key: 'cost', label: 'Cost', fieldType: 'number', visibility: 'leads' };

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

    planId = (await prisma.plan.create({ data: { name: `fu-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Followups Org ${k}`, slug: `fu-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_lead'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@fu.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@fu.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-${run}@fu.test` } });
      ids.divyaPerson = p.id;
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
    });
    ids.desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    ids.deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    await api('adminB', 'post', `/desk/desks/${ids.deskB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    for (const f of [OFFICE, FLOOR, VENDOR, COST]) await api('deskAdmin', 'post', `/desk/desks/${ids.desk}/fields`).send(f).expect(201);
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

  // ------------------------------------------------------------------------------------------ 1842
  describe('1842: requesters fill the fields everyone sees when they raise', () => {
    const raise = (fields: Record<string, unknown>, subject: string) => api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject, description: 'Help.', fields });

    it('the help centre offers only the fields everyone sees; a raise keeps them; the agent and the requester see them', async () => {
      const desk = ((await api('divya', 'get', '/desk/my/desks').expect(200)).body as { id: string; fields: { key: string; value: unknown }[] }[]).find((d) => d.id === ids.desk)!;
      expect(desk.fields.map((f) => f.key)).toEqual(['office', 'floor']);
      expect(desk.fields.every((f) => f.value === null)).toBe(true);
      const t = (await raise({ office: 'blr', floor: 'b1' }, `Raise fields ${run}`).expect(201)).body;
      const agentView = (await api('agent', 'get', `/desk/tickets/${t.id}`).expect(200)).body;
      expect(Object.fromEntries((agentView.deskFields as { key: string; value: unknown }[]).map((f) => [f.key, f.value]))).toMatchObject({ office: 'blr', floor: 'b1', vendor_ref: null });
      expect((await api('divya', 'get', `/desk/my/tickets/${t.id}`).expect(200)).body.deskFields).toEqual([{ label: 'Office', value: 'Bengaluru' }, { label: 'Floor', value: 'BLR 1' }]);
      // Nothing filled is fine: the fields are optional.
      await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `No fields ${run}`, description: 'Help.' }).expect(201);
    });

    it('negative: a staff-only or lead-only field, an unknown key, a value outside its parent and a non-object are refused and nothing is raised', async () => {
      const subject = `Refused fields ${run}`;
      expect((await raise({ vendor_ref: 'DELL-1' }, subject).expect(400)).body.message).toMatch(/not on tickets like this one/);
      await raise({ cost: 5 }, subject).expect(400);
      await raise({ nope: 'x' }, subject).expect(400);
      expect((await raise({ office: 'blr', floor: 'c1' }, subject).expect(400)).body).toMatchObject({ code: 'FIELD_ERRORS', errors: { floor: 'Choose one of the options offered.' } });
      await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject, description: 'Help.', fields: 'office' }).expect(400);
      expect(await ticketsOf(subject)).toBe(0);
      // Another company's fields never apply: its desk has none, so a key is unknown there.
      await api('agentB', 'post', '/desk/my/tickets').send({ deskId: ids.deskB, subject, description: 'Help.', fields: { office: 'blr' } }).expect(400);
    });

    it('the portal offers the fields everyone sees and a signed-in raise keeps them; a staff-only field is refused', async () => {
      ids.care = (await api('adminA', 'post', '/desk/desks').send({ name: 'Customer care', key: 'CARE', kind: 'customer_support' }).expect(201)).body.id;
      for (const f of [OFFICE, VENDOR]) await api('adminA', 'post', `/desk/desks/${ids.care}/fields`).send(f).expect(201);
      await api('adminA', 'post', '/desk/portals').send({ slug: 'care', name: 'Care', deskIds: [ids.care], signUp: 'open', openRequests: false }).expect(201);
      const portal = `/api/v1/desk/portal/${org.A.slug}/care`;
      const info = (await request(server()).get(portal).expect(200)).body;
      expect(info.desks[0].fields.map((f: { key: string }) => f.key)).toEqual(['office']);
      const email = `cust-${run}@cust-${run}.test`;
      await request(server()).post(`${portal}/sign-in`).send({ email }).expect(200);
      let code = '';
      for (let i = 0; i < 50 && !code; i++) {
        const m = (app.get(EmailService).send as jest.Mock).mock.calls.map((c) => c[0] as { to: string; text?: string; html: string }).reverse().find((x) => x.to === email && /\b\d{6}\b/.test(x.text ?? x.html));
        if (m) code = /\b(\d{6})\b/.exec(m.text ?? m.html)![1];
        else await new Promise((r) => setTimeout(r, 100));
      }
      ids.portalToken = (await request(server()).post(`${portal}/verify`).send({ email, code }).expect(200)).body.token as string;
      const send = (fields: Record<string, unknown>, subject: string) => request(server()).post(`${portal}/tickets`).set('x-portal-session', ids.portalToken).send({ deskId: ids.care, subject, description: 'Hello.', fields });
      const t = (await send({ office: 'che' }, `Portal raise ${run}`).expect(201)).body;
      expect((await request(server()).get(`${portal}/tickets/${t.id}`).set('x-portal-session', ids.portalToken).expect(200)).body.deskFields).toEqual([{ label: 'Office', value: 'Chennai' }]);
      await send({ vendor_ref: 'X' }, `Portal refused ${run}`).expect(400);
      expect((await send({ office: 'mum' }, `Portal refused ${run}`).expect(400)).body.errors).toEqual({ office: expect.any(String) });
      expect(await ticketsOf(`Portal refused ${run}`)).toBe(0);
    });
  });
  // ------------------------------------------------------------------------------------------ 1843
  describe('1843: "Required before solving" per field', () => {
    const fieldOf = async (key: string) => ((await api('deskAdmin', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.fields as { id: string; key: string; version: number }[]).find((f) => f.key === key)!;
    const require_ = async (key: string, def: object, on: boolean, status: number, who: Who = 'deskAdmin') => {
      const f = await fieldOf(key);
      return api(who, 'patch', `/desk/desks/${ids.desk}/fields/${f.id}`).send({ ...def, requiredToSolve: on, version: f.version }).expect(status);
    };
    const version = async (id: string) => (await api('agent', 'get', `/desk/tickets/${id}`).expect(200)).body.version as number;

    it('a required field stops solving until it has a value; then the ticket solves; the agent sees which fields are required', async () => {
      await require_('vendor_ref', VENDOR, true, 200);
      expect((await fieldOf('vendor_ref')) as unknown).toMatchObject({ requiredToSolve: true });
      const id = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `Required ${run}`, description: 'Help.' }).expect(201)).body.id as string;
      const view = (await api('agent', 'get', `/desk/tickets/${id}`).expect(200)).body;
      expect(view.deskFields.find((f: { key: string }) => f.key === 'vendor_ref')).toMatchObject({ requiredToSolve: true, value: null });
      const refused = (await api('agent', 'post', `/desk/tickets/${id}/resolve`).send({ version: view.version }).expect(400)).body;
      expect(refused).toMatchObject({ code: 'FIELDS_REQUIRED', message: 'Fill Vendor ref before solving.', fields: ['vendor_ref'] });
      expect((await api('agent', 'get', `/desk/tickets/${id}`).expect(200)).body.systemState).not.toBe('solved');
      await api('agent', 'put', `/desk/tickets/${id}/fields`).send({ values: { vendor_ref: 'DELL-9' } }).expect(200);
      await api('agent', 'post', `/desk/tickets/${id}/resolve`).send({ version: await version(id) }).expect(200);
      expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.field.updated', metadataJson: { contains: '"requiredToSolve":true' } } }))).toBe(1);
    });

    it('negative: a team-lead-only field cannot be required; an agent or another company cannot change it; a cleared value stops solving again', async () => {
      expect((await require_('cost', COST, true, 400)).body.message).toMatch(/only team leads see cannot be required/);
      await require_('vendor_ref', VENDOR, false, 403, 'agent');
      await require_('vendor_ref', VENDOR, false, 404, 'adminB');
      const id = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `Cleared ${run}`, description: 'Help.' }).expect(201)).body.id as string;
      await api('agent', 'put', `/desk/tickets/${id}/fields`).send({ values: { vendor_ref: 'X-1' } }).expect(200);
      await api('agent', 'put', `/desk/tickets/${id}/fields`).send({ values: { vendor_ref: null } }).expect(200);
      expect((await api('agent', 'post', `/desk/tickets/${id}/resolve`).send({ version: await version(id) }).expect(400)).body.code).toBe('FIELDS_REQUIRED');
      // Switched back to optional: it solves.
      await require_('vendor_ref', VENDOR, false, 200);
      await api('agent', 'post', `/desk/tickets/${id}/resolve`).send({ version: await version(id) }).expect(200);
    });
  });
  // ------------------------------------------------------------------------------------------ 1844
  describe('1844: field values in the CSV export and custom reports; team-lead-only fields only to leads', () => {
    beforeAll(async () => {
      const id = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: `Report fields ${run}`, description: 'Help.', fields: { office: 'blr', floor: 'b1' } }).expect(201)).body.id as string;
      await api('agent', 'put', `/desk/tickets/${id}/fields`).send({ values: { vendor_ref: 'DELL-44' } }).expect(200);
      await api('lead', 'put', `/desk/tickets/${id}/fields`).send({ values: { cost: 84500 } }).expect(200);
      ids.reportTicket = id;
    });
    const rowOf = (csv: string) => {
      const lines = csv.trim().split(/\r?\n/);
      const header = lines[0].split(',');
      const row = lines.find((l) => l.includes(`Report fields ${run}`))!.split(',');
      return Object.fromEntries(header.map((h, i) => [h, row[i]]));
    };

    it('the CSV export has a column per field: a lead gets the team-lead-only one, an agent does not (header or value)', async () => {
      const lead = rowOf((await api('lead', 'get', '/desk/tickets/export').expect(200)).text);
      expect(lead).toMatchObject({ Office: 'Bengaluru', Floor: 'BLR 1', 'Vendor ref': 'DELL-44', Cost: '84500' });
      const agentCsv = (await api('agent', 'get', '/desk/tickets/export').expect(200)).text;
      expect(rowOf(agentCsv)).toMatchObject({ Office: 'Bengaluru', 'Vendor ref': 'DELL-44' });
      expect(agentCsv).not.toMatch(/Cost|84500/);
      // Another company's export has none of these columns.
      expect((await api('agentB', 'get', '/desk/tickets/export').expect(200)).text).not.toMatch(/Office|Vendor ref/);
    });

    it('a custom report offers the fields this person sees, shows their values, and never a lead-only one to someone else', async () => {
      const cols = async (who: Who) => ((await api(who, 'get', '/desk/reports/custom/field-columns').expect(200)).body as { value: string }[]).map((c) => c.value);
      expect(await cols('lead')).toEqual(['field:office', 'field:floor', 'field:vendor_ref', 'field:cost']);
      expect(await cols('deskAdmin')).toEqual(['field:office', 'field:floor', 'field:vendor_ref']);
      const rep = (await api('lead', 'post', '/desk/reports/custom').send({ name: `Fields ${run}`, columns: ['number', 'field:office', 'field:cost'], filters: {}, shared: true }).expect(201)).body.id as string;
      const mine = (await api('lead', 'get', `/desk/reports/custom/${rep}/run`).expect(200)).body as { columns: string[]; rows: unknown[][] };
      expect(mine.columns).toEqual(['Number', 'Office', 'Cost']);
      expect(mine.rows).toContainEqual([expect.any(String), 'Bengaluru', '84500']);
      // The shared report run by a desk admin who is not a lead: the cost stays empty.
      const theirs = (await api('deskAdmin', 'get', `/desk/reports/custom/${rep}/run`).expect(200)).body as { rows: unknown[][] };
      expect(theirs.rows.some((r) => r[1] === 'Bengaluru')).toBe(true);
      expect(JSON.stringify(theirs)).not.toContain('84500');
      expect((await api('lead', 'get', `/desk/reports/custom/${rep}/run?format=csv`).expect(200)).text).toContain('84500');
    });

    it('negative: no one saves a field they cannot see or an unknown or odd column; agents and other companies cannot list field columns', async () => {
      await api('lead', 'post', '/desk/reports/custom').send({ name: `Bad ${run}`, columns: ['field:nope'], filters: {} }).expect(400);
      await api('lead', 'post', '/desk/reports/custom').send({ name: `Bad ${run}`, columns: ['field:Office!'], filters: {} }).expect(400);
      await api('agent', 'get', '/desk/reports/custom/field-columns').expect(403);
      expect((await api('agentB', 'get', '/desk/reports/custom/field-columns').expect(403)));
      // A desk admin (report viewer, no build right) cannot save one at all.
      await api('deskAdmin', 'post', '/desk/reports/custom').send({ name: `Bad ${run}`, columns: ['field:cost'], filters: {} }).expect(403);
    });
  });
});
