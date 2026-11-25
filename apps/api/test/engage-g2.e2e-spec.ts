import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { AnnouncementsService } from '../src/engage/announcements.service';

// Batch G2 (M09 Engage), end to end against the real database (forced RLS, the app role): item 12 announcements: the
// key, the audience by location and department, the email rule, scheduling, reading and acknowledging, reminders by
// hand (once a day) and by the job (day 2 and day 5); two companies kept apart.
describe('Batch G2 Engage', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let announcements: AnnouncementsService;
  const sent: { to: string; subject: string; html: string }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'emp1' | 'emp2' | 'noJob' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const ANN = { title: 'Revised canteen hygiene rules', body: '<p>Hairnets and gloves from Monday.</p>', locationIds: [] as string[], departmentIds: [] as string[], email: false, ackRequired: true, pinned: false };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string }) => (sent.push(m), { success: true })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    announcements = moduleRef.get(AnnouncementsService);

    planId = (await prisma.plan.create({ data: { name: `eng-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ENG Org ${k}`, slug: `eng-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', 'hr_admin'],
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['noJob', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${tpl}-${run}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === tpl)!.permissions) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@eng-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@eng-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const)
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `ENG Foods ${k}`, shortName: `EN${k}-${run}`, isDefault: true } })).id;
        for (const [code, name] of [['HSR', 'Hosur plant'], ['BLR', 'Bengaluru'], ['MAA', 'Chennai']] as const)
          ids[`${code}${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name, code, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        for (const code of ['ENG', 'OPS']) {
          const id = randomUUID();
          ids[`${code}${k}`] = (await tx.department.create({ data: { ...o, id, name: code, code, path: `/${id}/` } })).id;
        }
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENGR' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    const hire = async (who: Who, k: 'A' | 'B', loc: string, dept: string) =>
      api(k === 'A' ? 'adminA' : 'adminB', 'post', '/people/employees')
        .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[who], workEmail: `${who}@eng-${run}.test`, assignment: { locationId: ids[`${loc}${k}`], departmentId: ids[`${dept}${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: null } })
        .expect(201);
    await hire('hr', 'A', 'BLR', 'ENG');
    await hire('emp1', 'A', 'HSR', 'OPS');
    await hire('emp2', 'A', 'BLR', 'ENG');
    await hire('empB', 'B', 'HSR', 'OPS');
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('item 12: announcements', () => {
    it('only engage.announce (System Admin and HR by default) writes and tracks them; everyone else 403', async () => {
      for (const who of ['emp1', 'noJob'] as const) {
        await api(who, 'get', '/engage/announcements').expect(403);
        await api(who, 'post', '/engage/announcements').send(ANN).expect(403);
      }
      await api('hr', 'get', '/engage/announcements').expect(200);
      const o = (await api('adminA', 'get', '/engage/announcements/options').expect(200)).body;
      expect(o.everyone).toBe(3);
      expect(o.locations.map((l: { name: string }) => l.name).sort()).toEqual(['Bengaluru', 'Chennai', 'Hosur plant']);
      expect((await api('hr', 'post', '/engage/announcements/reach').send({ locationIds: [ids.HSRA], departmentIds: [] }).expect(200)).body.count).toBe(1);
      expect((await api('hr', 'post', '/engage/announcements/reach').send({ locationIds: [], departmentIds: [ids.ENGA] }).expect(200)).body.count).toBe(2);
    });

    it('refuses what it must: short title, no message, an amount by email, a due day without acknowledging, the past, another company’s place, nobody in the audience, unknown fields', async () => {
      const bad = (body: object) => api('hr', 'post', '/engage/announcements').send({ ...ANN, ...body }).expect(400);
      await bad({ title: 'ab' });
      await bad({ body: '<p> </p>' });
      await bad({ body: '<script>alert(1)</script>' });
      expect((await bad({ title: 'September bonus: ₹12,000 credited', email: true })).body.message).toMatch(/amounts/);
      await bad({ ackRequired: false, ackDueOn: shift(5) });
      await bad({ ackDueOn: shift(-1) });
      await bad({ publishAt: new Date(Date.now() - 3_600_000).toISOString() });
      await bad({ publishAt: new Date(Date.now() + 100 * 86_400_000).toISOString() });
      await bad({ locationIds: [ids.HSRB] });
      await bad({ locationIds: [ids.MAAA] });
      await bad({ extra: 1 });
      // In the app only, the amount is fine.
      await api('hr', 'post', '/engage/announcements').send({ ...ANN, title: 'September bonus: ₹12,000 credited', ackRequired: false, locationIds: [ids.BLRA] }).expect(201);
    });

    it('goes to its audience only: they see it (cleaned), it is marked read, they acknowledge; others see nothing and get 404', async () => {
      sent.length = 0;
      const a = (await api('hr', 'post', '/engage/announcements').send({ ...ANN, body: '<p>Hairnets <strong>and</strong> gloves.</p><img src="x" onerror="alert(1)">', locationIds: [ids.HSRA], email: true, ackDueOn: shift(7), pinned: true }).expect(201)).body;
      ids.hosur = a.id;
      const mine = (await api('emp1', 'get', '/engage/my/announcements').expect(200)).body;
      expect(mine[0]).toMatchObject({ id: a.id, title: ANN.title, pinned: true, ack: { due: shift(7), done: false } });
      expect(mine[0].body).toBe('<p>Hairnets <strong>and</strong> gloves.</p>');
      expect(((await api('emp2', 'get', '/engage/my/announcements').expect(200)).body as { id: string }[]).map((x) => x.id)).not.toContain(a.id);
      expect((await api('noJob', 'get', '/engage/my/announcements').expect(200)).body).toEqual([]);
      await api('emp2', 'post', `/engage/my/announcements/${a.id}/acknowledge`).expect(404);
      await api('emp1', 'post', `/engage/my/announcements/${a.id}/acknowledge`).expect(201);
      await api('emp1', 'post', `/engage/my/announcements/${a.id}/acknowledge`).expect(201);
      const d = (await api('hr', 'get', `/engage/announcements/${a.id}`).expect(200)).body;
      expect(d.rows).toEqual([expect.objectContaining({ id: users.emp1, location: 'Hosur plant', department: 'OPS' })]);
      expect(d.rows[0].read).not.toBeNull();
      expect(d.rows[0].acked).not.toBeNull();
      // Told in the bell, and by email with the title only (never the message).
      expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.emp1, type: 'engage.announcement.published', entityId: a.id } }))).toBe(1);
      const mail = sent.filter((m) => m.to === `emp1@eng-${run}.test`);
      expect(mail).toEqual([expect.objectContaining({ subject: `Announcement: ${ANN.title}` })]);
      expect(mail[0].html).not.toContain('gloves');
      expect(sent.filter((m) => m.to === `emp2@eng-${run}.test`)).toEqual([]);
    });

    it('an announcement that does not ask for acknowledgement cannot be acknowledged or reminded', async () => {
      const a = (await api('hr', 'post', '/engage/announcements').send({ ...ANN, ackRequired: false }).expect(201)).body;
      await api('emp2', 'post', `/engage/my/announcements/${a.id}/acknowledge`).expect(400);
      await api('hr', 'post', `/engage/announcements/${a.id}/remind`).expect(400);
    });

    it('Remind goes to those who have not acknowledged, once a day', async () => {
      const a = (await api('hr', 'post', '/engage/announcements').send({ ...ANN, departmentIds: [ids.ENGA, ids.OPSA] }).expect(201)).body;
      await api('emp1', 'post', `/engage/my/announcements/${a.id}/acknowledge`).expect(201);
      expect((await api('hr', 'post', `/engage/announcements/${a.id}/remind`).expect(201)).body).toEqual({ reminded: 2 });
      expect((await api('hr', 'post', `/engage/announcements/${a.id}/remind`).expect(409)).body.code).toBe('ENGAGE_REMINDED_TODAY');
      expect((await api('hr', 'get', `/engage/announcements/${a.id}`).expect(200)).body.canRemind).toBe(false);
      expect(await inA((tx) => tx.userNotification.count({ where: { type: 'engage.announcement.reminder', entityId: a.id } }))).toBe(2);
    });

    it('a scheduled one stays out of the feed and untold until its time; the job sends it then', async () => {
      const at = new Date(Date.now() + 2 * 86_400_000).toISOString();
      const a = (await api('hr', 'post', '/engage/announcements').send({ ...ANN, title: 'Diwali shutdown', publishAt: at }).expect(201)).body;
      expect(((await api('hr', 'get', '/engage/announcements').expect(200)).body as { id: string; scheduled: boolean }[]).find((x) => x.id === a.id)?.scheduled).toBe(true);
      expect(((await api('emp1', 'get', '/engage/my/announcements').expect(200)).body as { id: string }[]).map((x) => x.id)).not.toContain(a.id);
      await api('hr', 'post', `/engage/announcements/${a.id}/remind`).expect(400);
      await announcements.publishDue(org.A.id);
      expect(await inA((tx) => tx.userNotification.count({ where: { type: 'engage.announcement.published', entityId: a.id } }))).toBe(0);
      await inA((tx) => tx.engPost.update({ where: { id: a.id }, data: { publishAt: new Date(Date.now() - 60_000) } }));
      expect(await announcements.publishDue(org.A.id)).toBe(1);
      expect(await announcements.publishDue(org.A.id)).toBe(0);
      expect(await inA((tx) => tx.userNotification.count({ where: { type: 'engage.announcement.published', entityId: a.id } }))).toBe(3);
    });

    it('the job reminds on day 2 and day 5 only, and only those who have not acknowledged (answer 2602)', async () => {
      const a = (await api('hr', 'post', '/engage/announcements').send({ ...ANN, title: 'Fire drill on Friday' }).expect(201)).body;
      await api('emp2', 'post', `/engage/my/announcements/${a.id}/acknowledge`).expect(201);
      const count = () => inA((tx) => tx.userNotification.count({ where: { type: 'engage.announcement.reminder', entityId: a.id } }));
      await announcements.remindDue(shift(1));
      expect(await count()).toBe(0);
      await announcements.remindDue(shift(2));
      expect(await count()).toBe(2);
      await announcements.remindDue(shift(3));
      expect(await count()).toBe(2);
      await announcements.remindDue(shift(5));
      expect(await count()).toBe(4);
      await announcements.remindDue(shift(9));
      expect(await count()).toBe(4);
      expect(await inA((tx) => tx.userNotification.count({ where: { type: 'engage.announcement.reminder', entityId: a.id, recipientUserId: users.emp2 } }))).toBe(0);
    });

    it('another company sees none of it', async () => {
      expect(((await api('adminB', 'get', '/engage/announcements').expect(200)).body as unknown[]).length).toBe(0);
      await api('adminB', 'get', `/engage/announcements/${ids.hosur}`).expect(404);
      await api('adminB', 'post', `/engage/announcements/${ids.hosur}/remind`).expect(404);
      expect((await api('empB', 'get', '/engage/my/announcements').expect(200)).body).toEqual([]);
      await api('empB', 'post', `/engage/my/announcements/${ids.hosur}/acknowledge`).expect(404);
      // The database too: company B's session reads no row of company A.
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.engPost.count({ where: { id: ids.hosur } }))).toBe(0);
    });
  });
});
