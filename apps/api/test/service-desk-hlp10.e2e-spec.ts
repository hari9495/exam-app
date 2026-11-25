process.env.SD_SCANNER = 'dev-fake';
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
import { PoliciesService } from '../src/policies/policies.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HLP-10 / HLP-11 company policies end to end against the real database (forced RLS, the app role). Positive and
// negative: HR who writes, a second HR who publishes (the writer refused), an HR executive without the keys, employees
// in and out of the audience, another company, bad input, stale versions, an old version acknowledged, a double
// acknowledgement, typed name and one-time code, reminders (by HR and the morning job, the manager told once), the
// evidence export, and the database guards (a published version never changes; acknowledgements can't be changed).
describe('HLP-10 / HLP-11 company policies', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'writer' | 'publisher' | 'hrExec' | 'hrEntity' | 'divya' | 'arjun' | 'meena' | 'hrB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1/desk${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const setting = (key: string, value: string) =>
    inA(async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
      await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } });
    });
  type Detail = { version: number; open: { id: string; number: number; status: string; version: number; bodyHtml: string } | null; current: { id: string; number: number } | null; audience: number; acknowledged: number; settings: Record<string, unknown> };
  const detail = async (id = ids.pol, who: Who = 'writer') => (await api(who, 'get', `/policies/${id}`).expect(200)).body as Detail;
  const mine = async (who: Who) => (await api(who, 'get', '/my/policies').expect(200)).body as { policies: { id: string; status: string; version: string; versionId: string; dueOn: string | null }[]; typedName: boolean };
  /** Write, send and publish the open version (writer sends, publisher publishes). */
  const publishVersion = async (id: string, input: { bodyHtml: string; changeSummary?: string; reack?: boolean }) => {
    const d = await detail(id);
    const saved = (await api('writer', 'put', `/policies/${id}/draft`).send({ ...(d.open ? { version: d.open.version } : {}), ...input }).expect(200)).body as { version: number };
    await api('writer', 'post', `/policies/${id}/submit`).send({ version: saved.version }).expect(201);
    const waiting = await detail(id);
    await api('publisher', 'post', `/policies/${id}/publish`).send({ version: waiting.open!.version }).expect(201);
  };
  const codeSentTo = async (to: string) => {
    for (let i = 0; i < 40; i++) {
      const calls = (app.get(EmailService).send as jest.Mock).mock.calls as [{ to?: string; subject?: string }][];
      const hit = [...calls].reverse().find(([m]) => m.to === to && /^\d{6} is your/.test(m.subject ?? ''));
      if (hit) return hit[0].subject!.slice(0, 6);
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`no code sent to ${to}`);
  };

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
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `hlp10-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP10 Org ${k}`, slug: `hlp10-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['writer', 'A', 'panel', tpl('hr_admin')],
      ['publisher', 'A', 'panel', tpl('hr_admin')],
      ['hrExec', 'A', 'panel', tpl('hr_executive')],
      // HR Admin keys granted for one legal entity only (the template's typical scope): no company policies.
      ['hrEntity', 'A', 'panel', null],
      ['divya', 'A', 'panel', []],
      ['arjun', 'A', 'panel', []],
      ['meena', 'A', 'panel', []],
      ['hrB', 'B', 'panel', tpl('hr_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hlp10-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hlp10-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Policies Pvt Ltd', shortName: `KP${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.blr = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const ops = randomUUID();
      const sales = randomUUID();
      const field = randomUUID();
      ids.ops = (await tx.department.create({ data: { ...x, id: ops, name: 'Operations', code: 'OPS', path: `/${ops}/` } })).id;
      ids.sales = (await tx.department.create({ data: { ...x, id: sales, name: 'Sales', code: 'SAL', path: `/${sales}/` } })).id;
      // Field sales sits under Sales: a policy for Sales reaches it too.
      ids.field = (await tx.department.create({ data: { ...x, id: field, name: 'Field sales', code: 'FLD', parentId: sales, path: `/${sales}/${field}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      const role = await tx.permissionProfile.create({ data: { ...x, name: `hr-entity-${run}`, permissionsJson: JSON.stringify(tpl('hr_admin')) } });
      await tx.roleGrant.create({ data: { ...x, userId: users.hrEntity, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.entity, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Entity HR' } });
    });
    const hire = async (who: Who, given: string, code: string, departmentId: string, managerEmployeeId: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: 'Raghunathan', employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@hlp10-${run}.test`, assignment: { locationId: ids.blr, departmentId, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId } }).expect(201)).body.id as string;
    emp.meena = await hire('meena', 'Meena', 'KP-001', ids.ops, null);
    emp.divya = await hire('divya', 'Divya', 'KP-002', ids.field, emp.meena);
    emp.arjun = await hire('arjun', 'Arjun', 'KP-003', ids.ops, emp.meena);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only policy.manage / policy.publish reach policy admin; the HR Admin template carries both', async () => {
    expect(ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions).toEqual(expect.arrayContaining(['policy.manage', 'policy.publish']));
    await api('hrExec', 'get', '/policies').expect(403);
    // A legal-entity grant passes the route guard but confers nothing on company-wide policies (fail closed).
    await api('hrEntity', 'get', '/policies').expect(403);
    await api('hrEntity', 'post', '/policies').send({ title: 'Code of conduct', category: 'Conduct', method: 'click' }).expect(403);
    await api('divya', 'get', '/policies').expect(403);
    await api('hrExec', 'post', '/policies').send({ title: 'Code of conduct', category: 'Conduct', method: 'click' }).expect(403);
    await api('writer', 'get', '/policies').expect(200);
  });

  it('a new policy: bad input is refused; a second one with the same title is 409', async () => {
    await api('writer', 'post', '/policies').send({ title: 'x', category: 'Conduct', method: 'click' }).expect(400);
    await api('writer', 'post', '/policies').send({ title: 'Code of conduct', category: 'Conduct', method: 'sms' }).expect(400);
    await api('writer', 'post', '/policies').send({ title: 'Code of conduct', category: 'Conduct', method: 'click', extra: 1 }).expect(400);
    const p = (await api('writer', 'post', '/policies').send({ title: `Code of conduct ${run}`, category: 'Conduct', method: 'click' }).expect(201)).body;
    expect(p.code).toBe('POL-01');
    ids.pol = p.id;
    await api('writer', 'post', '/policies').send({ title: `CODE OF CONDUCT ${run}`, category: 'Conduct', method: 'click' }).expect(409);
    const d = await detail();
    expect(d.open).toMatchObject({ number: 1, status: 'draft' });
    expect(d.current).toBeNull();
    // The company's defaults.
    expect(d.settings).toEqual({ dueDays: 14, everyDays: 3, managerAfterDays: 7, reackDefault: true, typedName: false, secondPerson: true });
  });

  it('text is cleaned; an empty version cannot be sent; a stale save is 409', async () => {
    let d = await detail();
    await api('writer', 'post', `/policies/${ids.pol}/submit`).send({ version: d.open!.version }).expect(400);
    await api('writer', 'put', `/policies/${ids.pol}/draft`).send({ version: d.open!.version, bodyHtml: '<p>Be honest.</p><script>alert(1)</script><img src=x onerror=alert(1)>' }).expect(200);
    await api('writer', 'put', `/policies/${ids.pol}/draft`).send({ version: d.open!.version, bodyHtml: '<p>stale</p>' }).expect(409);
    d = await detail();
    expect(d.open!.bodyHtml).toBe('<p>Be honest.</p>');
  });

  it('the audience takes only this company\'s org structure; a stale change is 409', async () => {
    const d = await detail();
    await api('writer', 'patch', `/policies/${ids.pol}`).send({ version: d.version, departmentIds: [randomUUID()] }).expect(400);
    await api('writer', 'patch', `/policies/${ids.pol}`).send({ version: d.version, departmentIds: ['not-a-uuid'] }).expect(400);
    await api('writer', 'patch', `/policies/${ids.pol}`).send({ version: d.version, departmentIds: [ids.sales] }).expect(200);
    await api('writer', 'patch', `/policies/${ids.pol}`).send({ version: d.version, category: 'Ethics' }).expect(409);
  });

  it('maker-checker: the writer cannot publish their own version; a second person does; it is audited', async () => {
    let d = await detail();
    await api('writer', 'post', `/policies/${ids.pol}/submit`).send({ version: d.open!.version }).expect(201);
    d = await detail();
    expect(d.open!.status).toBe('waiting');
    // While it waits, nobody changes it.
    await api('writer', 'put', `/policies/${ids.pol}/draft`).send({ version: d.open!.version, bodyHtml: '<p>x</p>' }).expect(409);
    expect((await api('writer', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open!.version }).expect(403)).body.code).toBe('POLICY_SECOND_PERSON');
    await api('hrExec', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open!.version }).expect(403);
    await api('publisher', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open!.version + 5 }).expect(409);
    await api('publisher', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open!.version }).expect(201);
    await api('publisher', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open!.version }).expect(409);
    d = await detail();
    expect(d.current).toMatchObject({ number: 1 });
    expect(d.open).toBeNull();
    expect(d.audience).toBe(1); // Divya (Field sales, under Sales)
    const logs = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: 'policy.' } }, select: { action: true } }));
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(['policy.created', 'policy.changed', 'policy.version_saved', 'policy.version_sent', 'policy.version_published']));
  });

  it('a published version never changes and nothing is deleted by the app', async () => {
    const d = await detail();
    await expect(inA((tx) => tx.policyVersion.update({ where: { id: d.current!.id }, data: { bodyHtml: '<p>changed</p>' } }))).rejects.toThrow(/never changes/);
    await expect(inA((tx) => tx.policyVersion.delete({ where: { id: d.current!.id } }))).rejects.toThrow(/permission denied/);
  });

  it('employees in the audience see it; out of the audience they do not (404); another company 404', async () => {
    const list = await mine('divya');
    expect(list.policies).toEqual([expect.objectContaining({ id: ids.pol, status: 'pending', version: 'v1', dueOn: shift(today, 14) })]);
    expect((await mine('arjun')).policies).toEqual([]);
    await api('arjun', 'get', `/my/policies/${ids.pol}`).expect(404);
    await api('hrB', 'get', `/policies/${ids.pol}`).expect(404);
    await api('adminB', 'get', `/my/policies/${ids.pol}`).expect(404);
    const one = (await api('divya', 'get', `/my/policies/${ids.pol}`).expect(200)).body;
    expect(one).toMatchObject({ bodyHtml: '<p>Be honest.</p>', version: 'v1', status: 'pending', typedName: false, acknowledged: null });
  });

  it('acknowledging: tick required, the exact version, once; the record keeps the text fingerprint and cannot change', async () => {
    const versionId = (await mine('divya')).policies[0].versionId;
    await api('divya', 'post', `/my/policies/${ids.pol}/acknowledge`).send({ versionId, read: false }).expect(400);
    await api('divya', 'post', `/my/policies/${ids.pol}/acknowledge`).send({ versionId: randomUUID(), read: true }).expect(404);
    await api('arjun', 'post', `/my/policies/${ids.pol}/acknowledge`).send({ versionId, read: true }).expect(404);
    await api('divya', 'post', `/my/policies/${ids.pol}/acknowledge`).set('User-Agent', 'e2e-browser').send({ versionId, read: true }).expect(201);
    await api('divya', 'post', `/my/policies/${ids.pol}/acknowledge`).send({ versionId, read: true }).expect(409);
    const a = await inA((tx) => tx.policyAcknowledgement.findFirstOrThrow({ where: { organizationId: org.A.id, policyId: ids.pol } }));
    expect(a).toMatchObject({ method: 'click', userAgent: 'e2e-browser', employeeId: emp.divya });
    expect(a.bodySha256).toMatch(/^[0-9a-f]{64}$/);
    await expect(inA((tx) => tx.policyAcknowledgement.update({ where: { id: a.id }, data: { typedName: 'x' } }))).rejects.toThrow(/permission denied/);
    await expect(inA((tx) => tx.policyAcknowledgement.delete({ where: { id: a.id } }))).rejects.toThrow(/permission denied/);
    expect((await mine('divya')).policies[0]).toMatchObject({ status: 'acknowledged', dueOn: null });
    expect(await detail()).toMatchObject({ audience: 1, acknowledged: 1 });
  });

  it('a new version asks again; acknowledging the old one is refused; "what changed" is required', async () => {
    const oldVersion = (await mine('divya')).policies[0].versionId;
    await api('writer', 'put', `/policies/${ids.pol}/draft`).send({ bodyHtml: '<p>Be honest. Gifts up to a limit.</p>', reack: true }).expect(200);
    let d = await detail();
    expect(d.open).toMatchObject({ number: 2, status: 'draft' });
    expect((await api('writer', 'post', `/policies/${ids.pol}/submit`).send({ version: d.open!.version }).expect(400)).body.code).toBe('POLICY_SUMMARY_MISSING');
    // The publisher sends it back with a note (too short first).
    await api('writer', 'put', `/policies/${ids.pol}/draft`).send({ version: d.open!.version, bodyHtml: d.open!.bodyHtml, changeSummary: 'Adds a gifts rule.', reack: true }).expect(200);
    d = await detail();
    await api('writer', 'post', `/policies/${ids.pol}/submit`).send({ version: d.open!.version }).expect(201);
    d = await detail();
    await api('publisher', 'post', `/policies/${ids.pol}/send-back`).send({ version: d.open!.version, note: 'no' }).expect(400);
    await api('publisher', 'post', `/policies/${ids.pol}/send-back`).send({ version: d.open!.version, note: 'Name the gifts limit.' }).expect(201);
    d = await detail();
    expect(d.open).toMatchObject({ status: 'sent_back' });
    await publishVersion(ids.pol, { bodyHtml: '<p>Be honest. Gifts up to the limit in the annex.</p>', changeSummary: 'Adds a gifts rule.', reack: true });
    const now = (await mine('divya')).policies[0];
    expect(now).toMatchObject({ status: 'pending', version: 'v2' });
    expect((await api('divya', 'post', `/my/policies/${ids.pol}/acknowledge`).send({ versionId: oldVersion, read: true }).expect(409)).body.code).toBe('POLICY_NEWER_VERSION');
    await api('divya', 'post', `/my/policies/${ids.pol}/acknowledge`).send({ versionId: now.versionId, read: true }).expect(201);
    // A small change that does not ask again keeps Divya done.
    await publishVersion(ids.pol, { bodyHtml: '<p>Be honest. Gifts up to the limit in the annex (typo fixed).</p>', changeSummary: 'Typo fixed.', reack: false });
    expect((await mine('divya')).policies[0]).toMatchObject({ status: 'acknowledged', version: 'v3' });
  });

  it('typed name (company setting): missing or wrong is refused, the right name in any case is kept', async () => {
    await setting('policy.ack.typed_name', 'on');
    const p = (await api('writer', 'post', '/policies').send({ title: `Leave policy ${run}`, category: 'Time off', method: 'click' }).expect(201)).body;
    ids.leave = p.id;
    await publishVersion(p.id, { bodyHtml: '<p>Earned leave carries forward.</p>' });
    const versionId = (await mine('arjun')).policies.find((x) => x.id === p.id)!.versionId;
    expect((await api('arjun', 'post', `/my/policies/${p.id}/acknowledge`).send({ versionId, read: true }).expect(400)).body.code).toBe('POLICY_TYPED_NAME');
    await api('arjun', 'post', `/my/policies/${p.id}/acknowledge`).send({ versionId, read: true, typedName: 'Someone Else' }).expect(400);
    await api('arjun', 'post', `/my/policies/${p.id}/acknowledge`).send({ versionId, read: true, typedName: '  arjun   RAGHUNATHAN ' }).expect(201);
    const a = await inA((tx) => tx.policyAcknowledgement.findFirstOrThrow({ where: { organizationId: org.A.id, policyId: p.id, employeeId: emp.arjun } }));
    expect(a.typedName).toBe('arjun RAGHUNATHAN');
    await setting('policy.ack.typed_name', 'off');
  });

  it('one-time code: needed, a wrong code is refused, the right one acknowledges', async () => {
    const p = (await api('writer', 'post', '/policies').send({ title: `POSH ${run}`, category: 'Conduct', method: 'otp' }).expect(201)).body;
    ids.posh = p.id;
    await publishVersion(p.id, { bodyHtml: '<p>The Internal Committee hears complaints.</p>' });
    const versionId = (await mine('meena')).policies.find((x) => x.id === p.id)!.versionId;
    expect((await api('meena', 'post', `/my/policies/${p.id}/acknowledge`).send({ versionId, read: true }).expect(400)).body.code).toBe('POLICY_CODE_MISSING');
    await api('meena', 'post', `/my/policies/${ids.pol}/versions/${versionId}/code`).expect(404);
    await api('meena', 'post', `/my/policies/${ids.leave}/versions/${versionId}/code`).expect(404);
    expect((await api('meena', 'post', `/my/policies/${p.id}/versions/${versionId}/code`).expect(201)).body).toMatchObject({ sent: true, minutes: 5 });
    const code = await codeSentTo(`meena@hlp10-${run}.test`);
    expect((await api('meena', 'post', `/my/policies/${p.id}/acknowledge`).send({ versionId, read: true, code: code === '000000' ? '111111' : '000000' }).expect(401)).body.code).toBe('POLICY_CODE_WRONG');
    await api('meena', 'post', `/my/policies/${p.id}/acknowledge`).send({ versionId, read: true, code }).expect(201);
    expect((await inA((tx) => tx.policyAcknowledgement.findFirstOrThrow({ where: { organizationId: org.A.id, policyId: p.id } }))).method).toBe('otp');
  });

  it('pending people with the department drill-down; HR reminders once a day; the morning job tells the manager once', async () => {
    const pending = (await api('writer', 'get', `/policies/${ids.posh}/pending`).expect(200)).body as { employeeId: string; dept: string; manager: string | null; lastRemindedOn: string | null }[];
    expect(pending.map((x) => x.employeeId).sort()).toEqual([emp.arjun, emp.divya].sort());
    expect(pending.every((x) => x.lastRemindedOn === today)).toBe(true); // the publish notice counts
    expect((await api('writer', 'get', `/policies/${ids.posh}/pending?departmentId=${ids.ops}`).expect(200)).body).toEqual([expect.objectContaining({ employeeId: emp.arjun, dept: 'Operations', manager: 'Meena Raghunathan' })]);
    await api('writer', 'get', `/policies/${ids.posh}/pending?departmentId=nope`).expect(400);
    // Everyone was told today at publish, so HR's reminder skips them.
    expect((await api('writer', 'post', `/policies/${ids.posh}/remind`).send({}).expect(201)).body).toEqual({ sent: 0, skipped: 2 });
    await api('hrExec', 'post', `/policies/${ids.posh}/remind`).send({}).expect(403);
    const svc = app.get(PoliciesService);
    const sent = (kind: string, on: string) => inA((tx) => tx.policyReminder.count({ where: { organizationId: org.A.id, policyId: ids.posh, kind, sentOn: new Date(`${on}T00:00:00Z`) } }));
    // Two days later nobody (every 3 days); three days later both; a second run the same day sends nothing.
    await svc.remindOrg(org.A.id, shift(today, 2));
    expect(await sent('employee', shift(today, 2))).toBe(0);
    const day3 = shift(today, 3);
    expect(await svc.remindOrg(org.A.id, day3)).toBeGreaterThan(0);
    expect(await svc.remindOrg(org.A.id, day3)).toBe(0);
    expect(await sent('employee', day3)).toBe(2);
    // 7 days past the due day (14 + 7): the manager (Meena) is told once for each; three days later only reminders.
    await svc.remindOrg(org.A.id, shift(today, 21));
    expect(await sent('manager', shift(today, 21))).toBe(2);
    await svc.remindOrg(org.A.id, shift(today, 24));
    expect(await sent('manager', shift(today, 24))).toBe(0);
    expect(await sent('employee', shift(today, 24))).toBe(2);
  });

  it('the evidence export lists every acknowledgement (policy.manage only), with the fingerprint', async () => {
    await api('hrExec', 'get', `/policies/${ids.pol}/evidence`).expect(403);
    await api('hrB', 'get', `/policies/${ids.pol}/evidence`).expect(404);
    const res = await api('writer', 'get', `/policies/${ids.pol}/evidence`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.split('\r\n');
    expect(lines).toHaveLength(3); // header + v1 + v2 by Divya
    expect(lines[1]).toContain('"v1"');
    expect(lines[2]).toMatch(/"v2".*"Divya Raghunathan".*"KP-002".*"Confirmation".*"[0-9a-f]{64}"/);
  });

  it('attachments: only allowed types, on the open version; the employee opens a clean one of the current version', async () => {
    await api('writer', 'put', `/policies/${ids.leave}/draft`).send({ bodyHtml: '<p>Earned leave carries forward up to the limit.</p>', changeSummary: 'Adds the annex.', reack: false }).expect(200);
    await api('writer', 'post', `/policies/${ids.leave}/draft/files`).attach('file', Buffer.from('<html>x</html>'), 'annex.pdf').expect(400);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const f = (await api('writer', 'post', `/policies/${ids.leave}/draft/files`).attach('file', pdf, 'annex.pdf').expect(201)).body;
    const d = await detail(ids.leave);
    await api('writer', 'post', `/policies/${ids.leave}/submit`).send({ version: d.open!.version }).expect(201);
    await api('publisher', 'post', `/policies/${ids.leave}/publish`).send({ version: (await detail(ids.leave)).open!.version }).expect(201);
    await inA((tx) => tx.file.update({ where: { id: f.id }, data: { scanStatus: 'clean' } }));
    const got = await api('arjun', 'get', `/my/policies/${ids.leave}/files/${f.id}`).expect(200);
    expect(got.headers['content-disposition']).toContain('annex.pdf');
    await api('arjun', 'get', `/my/policies/${ids.leave}/files/${randomUUID()}`).expect(404);
    await api('arjun', 'get', `/my/policies/${ids.pol}/files/${f.id}`).expect(404);
  });

  it('with the second-person setting off, the writer may publish their own version', async () => {
    await setting('policy.publish.second_person', 'off');
    const p = (await api('writer', 'post', '/policies').send({ title: `IT security ${run}`, category: 'IT', method: 'click' }).expect(201)).body;
    const saved = (await api('writer', 'put', `/policies/${p.id}/draft`).send({ version: (await detail(p.id)).open!.version, bodyHtml: '<p>Lock your screen.</p>' }).expect(200)).body;
    await api('writer', 'post', `/policies/${p.id}/submit`).send({ version: saved.version }).expect(201);
    await api('writer', 'post', `/policies/${p.id}/publish`).send({ version: (await detail(p.id)).open!.version }).expect(201);
    await setting('policy.publish.second_person', 'on');
  });
});
