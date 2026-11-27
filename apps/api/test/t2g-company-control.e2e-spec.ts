import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { UserGroupsService } from '../src/user-groups/user-groups.service';

// T2-G (company control), against the real database (forced RLS, app role). 41 modules on / off and order (answer 2746);
// 42 rule-based groups and 44 a named owner per module (answer 2745); 47 headcount and attrition (answer 2747).
describe('T2-G: company control', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  let planId = '';
  const ids: Record<string, string> = {};
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const api = (who: string, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Mod = { id: string; label: string; on: boolean; locked: boolean };
  const modules = async (who: string) => (await api(who, 'get', '/org/modules').expect(200)).body.modules as Mod[];
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A!, isSuperAdmin: false }, fn);
  // Desk tickets are read as the desk's system (as the helpdesk e2e does).
  const deskSystem = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => inA(async (tx) => (await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`, fn(tx)));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `t2g-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `t2g-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `T2G ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);
      const people: [string, string[] | null][] = [
        ['hr', ['org.settings.manage', 'org.structure.view']],
        ['plain', ['org.structure.view']],
        ['admin', null],
        ['emp1', []],
        ['emp2', []],
      ];
      for (const [who, keys] of people) {
        const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k]!, name: `${who}-${k}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
        const email = `${who}-${k.toLowerCase()}-${run}@t2g.test`;
        const id = `${who}${k}`;
        users[id] = (await at((tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k} ${run}`, passwordHash, role: keys ? 'panel' : 'org_admin', permissionProfileId } }))).id;
        token[id] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
      // The structure and two employees per company: emp1 at Hosur in Operations, emp2 in Bengaluru in Engineering (grade G2).
      await at(async (tx) => {
        const o = { organizationId: org[k]! };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `T2G Foods ${k}`, shortName: `TG${k}-${run}`, isDefault: true } })).id;
        for (const [code, name] of [['HSR', 'Hosur plant'], ['BLR', 'Bengaluru']] as const)
          ids[`${code}${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`]!, name, code, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        for (const code of ['ENG', 'OPS']) {
          const id = randomUUID();
          ids[`${code}${k}`] = (await tx.department.create({ data: { ...o, id, name: code, code, path: `/${id}/` } })).id;
        }
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENGR' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        ids[`g2${k}`] = (await tx.grade.create({ data: { ...o, name: 'G2', code: 'G2', rank: 2 } })).id;
      });
      const hire = (who: string, loc: string, dept: string, grade?: string) =>
        api(`admin${k}`, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[`${who}${k}`], workEmail: `${who}-${k.toLowerCase()}-${run}@t2g.test`, assignment: { locationId: ids[`${loc}${k}`], departmentId: ids[`${dept}${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], ...(grade ? { gradeId: ids[`${grade}${k}`] } : {}), managerEmployeeId: null } })
          .expect(201);
      await hire('emp1', 'HSR', 'OPS');
      await hire('emp2', 'BLR', 'ENG', 'g2');
    }
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('41 modules on / off and order', () => {
    it('everyone signed in reads the modules: all on, in the designed order, People and Payroll locked', async () => {
      const m = await modules('plainA');
      expect(m.map((x) => x.id).slice(0, 3)).toEqual(['people', 'time', 'pay']);
      expect(m.every((x) => x.on)).toBe(true);
      expect(m.filter((x) => x.locked).map((x) => x.id).sort()).toEqual(['compliance', 'pay', 'people']);
    });

    it('only the settings key changes them, never while acting for someone; bad ids are a 400', async () => {
      await api('plainA', 'put', '/org/modules').send({ off: ['learning'], order: [] }).expect(403);
      await api('hrA', 'put', '/org/modules').send({ off: ['nonsense'], order: [] }).expect(400);
      await api('hrA', 'put', '/org/modules').send({ off: 'learning', order: [] }).expect(400);
      expect((await modules('hrA')).find((x) => x.id === 'learning')!.on).toBe(true);
    });

    it('People and Payroll cannot be switched off (400, nothing changes)', async () => {
      for (const id of ['people', 'pay', 'compliance']) {
        const res = await api('hrA', 'put', '/org/modules').send({ off: [id], order: [] }).expect(400);
        expect(res.body.message).toMatch(/cannot be switched off/);
      }
      await api('hrA', 'put', '/org/settings').send({ key: 'org.modules.off', scopeType: 'tenant', value: 'people' }).expect(400);
      expect((await modules('hrA')).every((x) => x.on)).toBe(true);
    });

    it('a switched-off module answers 403 for its routes, only in that company; data is kept; on again brings it back', async () => {
      await api('plainA', 'get', '/learning/me/roles').expect(200);
      const saved = (await api('hrA', 'put', '/org/modules').send({ off: ['learning'], order: [] }).expect(200)).body.modules as Mod[];
      expect(saved.find((x) => x.id === 'learning')!.on).toBe(false);
      const off = await api('plainA', 'get', '/learning/me/roles').expect(403);
      expect(off.body.code).toBe('MODULE_OFF');
      expect(off.body.message).toMatch(/Learning is switched off/);
      // Other modules, shared routes and the other company are untouched.
      await api('plainA', 'get', '/org/modules').expect(200);
      await api('plainB', 'get', '/learning/me/roles').expect(200);
      expect((await modules('plainB')).every((x) => x.on)).toBe(true);
      const audited = await inA((tx) => tx.auditLog.findMany({ where: { action: 'org.setting.changed', organizationId: org.A! }, select: { metadataJson: true } }));
      expect(audited.some((a) => (a.metadataJson ?? '').includes('org.modules.off'))).toBe(true);
      await api('hrA', 'put', '/org/modules').send({ off: [], order: [] }).expect(200);
      await api('plainA', 'get', '/learning/me/roles').expect(200);
    });

    it('the rail order is saved; modules not placed follow in the designed order', async () => {
      const m = (await api('hrA', 'put', '/org/modules').send({ off: [], order: ['learning', 'hire'] }).expect(200)).body.modules as Mod[];
      expect(m.map((x) => x.id).slice(0, 3)).toEqual(['learning', 'hire', 'people']);
      expect(m).toHaveLength((await modules('plainB')).length);
      expect((await modules('plainA')).map((x) => x.id).slice(0, 2)).toEqual(['learning', 'hire']);
      expect((await modules('plainB')).map((x) => x.id)[0]).toBe('people');
    });
  });
  describe('42 rule-based groups', () => {
    type Group = { id: string; name: string; rules: Record<string, string[]> | null; members: { userId: string }[] };
    const rules = (over: Record<string, string[]>) => ({ legalEntityIds: [], locationIds: [], departmentIds: [], gradeIds: [], employmentTypeIds: [], ...over });
    let gid = '';

    it('a group from rules: members are worked out on save (only that company, only matching jobs); audited', async () => {
      await api('plainA', 'post', '/user-groups').send({ name: `Hosur ${run}`, rules: rules({ locationIds: [ids.HSRA!] }) }).expect(403);
      const g = (await api('adminA', 'post', '/user-groups').send({ name: `Hosur ${run}`, rules: rules({ locationIds: [ids.HSRA!] }) }).expect(201)).body as Group;
      gid = g.id;
      expect(g.rules!.locationIds).toEqual([ids.HSRA]);
      expect(g.members.map((m) => m.userId)).toEqual([users.emp1A]);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'user_group.created', entityId: gid } }))).toBe(1);
    });

    it('refuses no rules, another company’s records, hand-picked members and unknown fields (400)', async () => {
      await api('adminA', 'post', '/user-groups').send({ name: `None ${run}`, rules: rules({}) }).expect(400);
      await api('adminA', 'post', '/user-groups').send({ name: `Other ${run}`, rules: rules({ locationIds: [ids.HSRB!] }) }).expect(400);
      await api('adminA', 'post', '/user-groups').send({ name: `Mixed ${run}`, rules: rules({ locationIds: [ids.HSRA!] }), memberUserIds: [users.emp2A] }).expect(400);
      await api('adminA', 'post', '/user-groups').send({ name: `Bad ${run}`, rules: { colour: ['x'] } }).expect(400);
      await api('adminA', 'put', `/user-groups/${gid}/members`).send({ userIds: [users.emp2A] }).expect(400);
    });

    it('changing the rules works the members out again; grade and department rules; all rules must match', async () => {
      const byGrade = (await api('adminA', 'post', '/user-groups').send({ name: `G2 ${run}`, rules: rules({ gradeIds: [ids.g2A!] }) }).expect(201)).body as Group;
      expect(byGrade.members.map((m) => m.userId)).toEqual([users.emp2A]);
      const g = (await request(server()).patch(`/api/v1/user-groups/${gid}`).set('Authorization', `Bearer ${token.adminA}`).send({ rules: rules({ departmentIds: [ids.ENGA!, ids.OPSA!], locationIds: [ids.BLRA!] }) }).expect(200)).body as Group;
      expect(g.members.map((m) => m.userId)).toEqual([users.emp2A]);
      await request(server()).patch(`/api/v1/user-groups/${gid}`).set('Authorization', `Bearer ${token.adminA}`).send({ rules: rules({ locationIds: [ids.HSRA!] }) }).expect(200);
    });

    it('the nightly sweep brings members back to the rules; a rule group never joins hiring’s groups', async () => {
      await inA((tx) => tx.userGroupMember.deleteMany({ where: { groupId: gid } }));
      await app.get(UserGroupsService).sweep();
      expect((await inA((tx) => tx.userGroupMember.findMany({ where: { groupId: gid } }))).map((m) => m.userId)).toEqual([users.emp1A]);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'user_group.members_worked_out', entityId: gid } }))).toBeGreaterThan(0);
      const dir = (await api('adminA', 'get', '/user-groups/directory').expect(200)).body as { id: string }[];
      expect(dir.some((d) => d.id === gid)).toBe(false);
      const opts = (await api('hrA', 'get', '/user-groups/options').expect(200)).body as { id: string; ruleBased: boolean; members: number }[];
      expect(opts.find((o) => o.id === gid)).toEqual(expect.objectContaining({ ruleBased: true, members: 1 }));
      await api('plainA', 'get', '/user-groups/options').expect(403);
    });

    it('another company never sees or changes the group (404, not in its lists)', async () => {
      expect(((await api('adminB', 'get', '/user-groups').expect(200)).body as Group[]).some((g) => g.id === gid)).toBe(false);
      await request(server()).patch(`/api/v1/user-groups/${gid}`).set('Authorization', `Bearer ${token.adminB}`).send({ name: 'Taken' }).expect(404);
      await api('adminB', 'post', `/user-groups/${gid}/refresh`).expect(404);
    });

    it('announcements reach the group; another company’s group is a 400', async () => {
      expect((await api('adminA', 'post', '/engage/announcements/reach').send({ locationIds: [], departmentIds: [], groupIds: [gid] }).expect(200)).body.count).toBe(1);
      expect((await api('adminA', 'post', '/engage/announcements/reach').send({ locationIds: [], departmentIds: [] }).expect(200)).body.count).toBe(2);
      await api('adminB', 'post', '/engage/announcements/reach').send({ locationIds: [], departmentIds: [], groupIds: [gid] }).expect(400);
      expect(((await api('adminA', 'get', '/engage/announcements/options').expect(200)).body.groups as { id: string }[]).some((g) => g.id === gid)).toBe(true);
    });
  });
  describe('2903 tags on the person and the Tags rule', () => {
    type Tags = { tags: { id: string; name: string; archived: boolean }[]; canEdit: boolean };
    const emp = async (k: 'A' | 'B', who: string) => (await tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, (tx) => tx.employee.findFirstOrThrow({ where: { userId: users[`${who}${k}`] }, select: { id: true } }))).id;
    const tag: Record<string, string> = {};

    it('HR keeps the tag list as a structure master (settings key); others may not; another company never sees it', async () => {
      await api('plainA', 'post', '/org/masters/tags').send({ name: 'First aider' }).expect(403);
      for (const [k, name] of [['fa', 'First aider'], ['fw', 'Fire warden'], ['old', 'Old tag']] as const) tag[k] = (await api('hrA', 'post', '/org/masters/tags').send({ name }).expect(201)).body.id;
      tag.b = (await api('hrB', 'post', '/org/masters/tags').send({ name: 'First aider' }).expect(201)).body.id;
      const listA = (await api('plainA', 'get', '/org/masters/tags').expect(200)).body as { id: string }[];
      expect(listA.map((t) => t.id).sort()).toEqual([tag.fa, tag.fw, tag.old].sort());
      await api('hrB', 'put', `/org/masters/tags/${tag.fa}`).send({ name: 'Taken' }).expect(404);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'org.person_tag.created', entityId: tag.fa } }))).toBe(1);
    });

    it('HR puts tags on a person (audited); the person, plain users and another company may not; bad tags are a 400', async () => {
      const e1 = await emp('A', 'emp1');
      await api('emp1A', 'put', `/people/employees/${e1}/tags`).send({ tagIds: [tag.fa] }).expect(403);
      await api('emp1A', 'get', `/people/employees/${e1}/tags`).expect(403);
      await api('plainA', 'put', `/people/employees/${e1}/tags`).send({ tagIds: [tag.fa] }).expect(403);
      await api('adminB', 'put', `/people/employees/${e1}/tags`).send({ tagIds: [tag.b] }).expect(404);
      await api('adminA', 'put', `/people/employees/${e1}/tags`).send({ tagIds: [tag.b] }).expect(400);
      await api('adminA', 'put', `/people/employees/${e1}/tags`).send({ tagIds: ['not-a-uuid'] }).expect(400);
      const saved = (await api('adminA', 'put', `/people/employees/${e1}/tags`).send({ tagIds: [tag.fa, tag.old] }).expect(200)).body as Tags;
      expect(saved.tags.map((t) => t.name)).toEqual(['First aider', 'Old tag']);
      expect(((await api('adminA', 'get', `/people/employees/${e1}/tags`).expect(200)).body as Tags).canEdit).toBe(true);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'employee.tags.updated', entityId: e1 } }))).toBe(1);
    });

    it('a tag in use is archived, never deleted; an archived tag stays on the person but is not added anew', async () => {
      await api('hrA', 'delete', `/org/masters/tags/${tag.old}`).expect(409);
      await api('hrA', 'post', `/org/masters/tags/${tag.old}/archive`).expect(200);
      const e1 = await emp('A', 'emp1');
      const e2 = await emp('A', 'emp2');
      await api('adminA', 'put', `/people/employees/${e2}/tags`).send({ tagIds: [tag.old] }).expect(400);
      expect(((await api('adminA', 'put', `/people/employees/${e1}/tags`).send({ tagIds: [tag.fa, tag.old] }).expect(200)).body as Tags).tags.find((t) => t.id === tag.old)!.archived).toBe(true);
      await api('hrA', 'delete', `/org/masters/tags/${tag.fw}`).expect(204);
    });

    it('a group from a Tags rule holds the tagged people; untagging and the sweep drop them', async () => {
      const g = (await api('adminA', 'post', '/user-groups').send({ name: `Aiders ${run}`, rules: { tagIds: [tag.fa] } }).expect(201)).body as { id: string; rules: Record<string, string[]>; members: { userId: string }[] };
      expect(g.members.map((m) => m.userId)).toEqual([users.emp1A]);
      expect(g.rules.locationIds).toEqual([]);
      await api('adminA', 'post', '/user-groups').send({ name: `Other tags ${run}`, rules: { tagIds: [tag.b] } }).expect(400);
      await api('adminA', 'put', `/people/employees/${await emp('A', 'emp1')}/tags`).send({ tagIds: [] }).expect(200);
      await app.get(UserGroupsService).sweep();
      expect(await inA((tx) => tx.userGroupMember.count({ where: { groupId: g.id } }))).toBe(0);
    });
  });
  describe('84a renamed terms', () => {
    const set = (who: string, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, scopeType: 'tenant', value });
    it("HR saves the company's words (audited); everyone signed in reads them; the other company keeps YukthiX's", async () => {
      const before = (await api('emp1A', 'get', '/org/display').expect(200)).body.terms;
      expect(before.department).toEqual({ one: 'Department', many: 'Departments' });
      await set('hrA', 'terms.department.one', 'Business unit').expect(200);
      await set('hrA', 'terms.department.many', 'Business units').expect(200);
      expect((await api('emp1A', 'get', '/org/display').expect(200)).body.terms.department).toEqual({ one: 'Business unit', many: 'Business units' });
      expect((await api('emp1B', 'get', '/org/display').expect(200)).body.terms.department).toEqual({ one: 'Department', many: 'Departments' });
      const audited = await inA((tx) => tx.auditLog.findMany({ where: { action: 'org.setting.changed', organizationId: org.A! }, select: { metadataJson: true } }));
      expect(audited.some((a) => (a.metadataJson ?? '').includes('terms.department.one'))).toBe(true);
    });
    it('negative: markup, a second line, more than 30 characters, scopes other than the company and people without the key are refused', async () => {
      await set('hrA', 'terms.grade.one', '<b>Band</b>').expect(400);
      await set('hrA', 'terms.grade.one', 'Band\nTwo').expect(400);
      await set('hrA', 'terms.grade.one', 'x'.repeat(31)).expect(400);
      await api('hrA', 'put', '/org/settings').send({ key: 'terms.grade.one', scopeType: 'legal_entity', scopeId: ids.entityA, value: 'Band' }).expect(400);
      await set('plainA', 'terms.grade.one', 'Band').expect(403);
      await set('emp1A', 'terms.grade.one', 'Band').expect(403);
      expect((await api('plainA', 'get', '/org/display').expect(200)).body.terms.grade.one).toBe('Grade');
    });
  });
  describe('44 a named owner per module', () => {
    type Owned = { id: string; owner: { id: string; name: string } | null };
    const owners = (who: string, o: Record<string, string | null>) => api(who, 'put', '/org/modules').send({ off: [], order: [], owners: o });

    it('HR names owners (audited); everyone reads them; nobody else may; only active people of the company', async () => {
      await owners('plainA', { pay: users.emp2A! }).expect(403);
      await owners('hrA', { pay: users.emp1B! }).expect(404);
      await owners('hrA', { nonsense: users.emp2A! }).expect(400);
      const m = (await owners('hrA', { pay: users.emp2A!, people: users.emp2A! }).expect(200)).body.modules as Owned[];
      expect(m.find((x) => x.id === 'pay')!.owner).toEqual({ id: users.emp2A, name: `emp2 A ${run}` });
      expect(((await api('emp1A', 'get', '/org/modules').expect(200)).body.modules as Owned[]).find((x) => x.id === 'pay')!.owner!.id).toBe(users.emp2A);
      expect(((await api('emp1B', 'get', '/org/modules').expect(200)).body.modules as Owned[]).every((x) => x.owner === null)).toBe(true);
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'org.setting.changed', metadataJson: { contains: 'org.module_owner.pay' } } }))).toBe(1);
      const hub = (await api('adminA', 'get', '/help/setup-hub').expect(200)).body as { id: string; owner: string }[];
      expect(hub.find((a) => a.id === 'people')!.owner).toBe(`emp2 A ${run}`);
    });

    it("helpdesk: a category answered by the module's owner routes its tickets to that person; else the desk", async () => {
      const desk = (await api('adminA', 'post', '/desk/desks').send({ name: `T2G help ${run}`, key: 'TG', kind: 'hr' }).expect(201)).body.id as string;
      await api('adminA', 'post', `/desk/desks/${desk}/categories`).send({ name: `No module ${run}`, answeredBy: 'owner' }).expect(400);
      await api('adminA', 'post', `/desk/desks/${desk}/categories`).send({ name: `Secret ${run}`, answeredBy: 'owner', module: 'pay', sensitive: true }).expect(400);
      await api('adminA', 'post', `/desk/desks/${desk}/categories`).send({ name: `Bad ${run}`, answeredBy: 'owner', module: 'nonsense' }).expect(400);
      const cat = (await api('adminA', 'post', `/desk/desks/${desk}/categories`).send({ name: `Payslip ${run}`, answeredBy: 'owner', module: 'pay' }).expect(201)).body.id as string;
      const raise = (who: string) => api(who, 'post', '/desk/my/tickets').send({ deskId: desk, categoryId: cat, subject: `My payslip ${run}`, description: 'A question.' }).expect(201);
      const t = (await raise('emp1A')).body as { id: string; answeredBy: string };
      expect(t.answeredBy).toBe('owner');
      expect((await deskSystem((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).answerUserId).toBe(users.emp2A);
      // The owner raising it themselves, or no owner named: the desk answers.
      expect((await raise('emp2A')).body.answeredBy).toBe('desk');
      await owners('hrA', { pay: null }).expect(200);
      const u = (await raise('emp1A')).body as { id: string; answeredBy: string };
      expect(u.answeredBy).toBe('desk');
      expect((await deskSystem((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: u.id } }))).answerUserId).toBeNull();
    });
  });
  describe('47 headcount and attrition', () => {
    const month = today.slice(0, 7);
    type Report = { months: { month: string; headcount: number }[]; total: { avgHeadcount: number; exits: number; notRecorded: number; rate: number | null }; groups: { name: string; hidden: boolean; exits?: number }[] };

    it('only the people analytics key (company-wide) reads it; bad periods and splits are a 400', async () => {
      await api('plainA', 'get', '/people/attrition').expect(403);
      await api('hrA', 'get', '/people/attrition').expect(403);
      await api('adminA', 'get', `/people/attrition?from=${month}&to=${month}&by=colour`).expect(400);
      await api('adminA', 'get', '/people/attrition?from=2026-05&to=2026-04').expect(400);
      await api('adminA', 'get', '/people/attrition?from=2020-01&to=2026-01').expect(400);
      await api('adminA', 'get', '/people/attrition?from=april').expect(400);
    });

    it('headcount on the month end, only this company; groups under 5 people show no numbers', async () => {
      const r = (await api('adminA', 'get', `/people/attrition?from=${month}&to=${month}&by=department`).expect(200)).body as Report;
      expect(r.months).toEqual([{ month, headcount: 2 }]);
      expect(r.total).toEqual(expect.objectContaining({ avgHeadcount: 2, exits: 0, rate: 0 }));
      expect(r.groups.map((g) => [g.name, g.hidden])).toEqual([['ENG', true], ['OPS', true]]);
      expect(JSON.stringify(r.groups)).not.toMatch(/avgHeadcount/);
      expect(((await api('adminB', 'get', `/people/attrition?from=${month}&to=${month}`).expect(200)).body as Report).months[0]!.headcount).toBe(2);
    });

    it('an exit counts in the month (not recorded without an exit case) and leaves the month-end headcount; CSV export is recorded', async () => {
      await inA(async (tx) => {
        const e = await tx.employee.findFirstOrThrow({ where: { organizationId: org.A!, userId: users.emp1A } });
        await tx.employment.updateMany({ where: { organizationId: org.A!, employeeId: e.id }, data: { exitedOn: new Date(`${today}T00:00:00Z`) } });
      });
      const r = (await api('adminA', 'get', `/people/attrition?from=${month}&to=${month}&by=location`).expect(200)).body as Report;
      expect(r.months[0]!.headcount).toBe(1);
      expect(r.total).toEqual(expect.objectContaining({ exits: 1, notRecorded: 1, rate: 100 }));
      const csv = await api('adminA', 'get', `/people/attrition/export?from=${month}&to=${month}&by=location`).expect(200);
      expect(csv.headers['content-type']).toMatch(/text\/csv/);
      expect(csv.text).toContain('Whole company,1,1,0,0,1,100,0');
      expect(csv.text).toContain('Fewer than 5 people');
      expect(await inA((tx) => tx.auditLog.count({ where: { action: 'people.attrition.exported' } }))).toBe(1);
      await api('plainA', 'get', `/people/attrition/export?from=${month}&to=${month}`).expect(403);
    });
  });
});
