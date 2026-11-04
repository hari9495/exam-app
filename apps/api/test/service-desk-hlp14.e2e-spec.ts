process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AiApiKeyResolverService, AiNotConfiguredError, BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HLP-14 Write policies with AI end to end against the real database (forced RLS, the app role). The AI is a fake
// provider behind the real AiApiKeyResolverService seam, so the real AiInvocationService (credit limit, usage record)
// runs and no real AI is ever called. Positive and negative: a policy manager drafts with the fake AI; AI off offers
// the starters; a law finding blocks approval until fixed; one manager approves and a second person publishes through
// the HLP-10/11 library (the approver refused, also by the database); no key, another company, acting for someone else,
// bad input, personal data in the notes, over-long answers, a failing AI, stale versions and repeats.
describe('HLP-14 Write policies with AI', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'manager' | 'second' | 'hrExec' | 'hrEntity' | 'staff' | 'hrB' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const desk = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/desk${path}`).set('Authorization', `Bearer ${token[who]}`);
  const w = (who: Who, method: 'get' | 'post' | 'put', path = '') => desk(who, method, `/policy-writer${path}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const setting = (key: string, value: string | null) =>
    inA(async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
      if (value) await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } });
    });

  // The fake AI: what it answers, every prompt it was sent, and whether the company has a provider at all.
  const fake = { configured: true, prompts: [] as string[], answer: async (): Promise<Record<string, unknown>> => ({ clauses: CLAUSES }) };
  const CLAUSES = [
    { title: 'Purpose', text: '<p>This policy explains leave.</p><script>alert(1)</script>' },
    { title: 'How to apply', text: 'Apply in YukthiX before you take leave. <img src=x onerror=alert(1)>' },
    { title: 'Records', text: 'YukthiX keeps every request.' },
  ];
  const ANSWERS = { mode: 'ai', type: 'leave', industry: 'fmcg', states: ['IN-KA', 'IN-TN'], headcount: 248, workPattern: 'shift', earned: 15, sick: 12, casual: 12, carry: 45, notes: 'Plant staff work Sundays in season.' };
  type View = { id: string; status: string; version: number; mode: string; values: Record<string, number>; clauses: { id: string; title: string; text: string; source: string; ref?: string; editable: boolean; finding?: string }[]; findings: { id: string; status: string; fix?: { key: string; value: number } }[]; openFindings: number; target: { title: string; policyId: string | null; number: number }; approvedByMe: boolean };
  const view = async (id: string, who: Who = 'manager') => (await w(who, 'get', `/drafts/${id}`).expect(200)).body as View;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .overrideProvider(AiApiKeyResolverService)
      .useValue({
        resolve: async () => {
          if (!fake.configured) throw new AiNotConfiguredError('no key');
          return { ping: async () => undefined, generateStructured: async (r: { prompt: string }) => (fake.prompts.push(r.prompt), fake.answer()) };
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `hlp14-plan-${run}`, candidateLimit: 1, aiCreditLimit: 100, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP14 Org ${k}`, slug: `hlp14-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['manager', 'A', 'panel', tpl('hr_admin')],
      ['second', 'A', 'panel', tpl('hr_admin')],
      ['hrExec', 'A', 'panel', tpl('hr_executive')],
      ['hrEntity', 'A', 'panel', null],
      ['staff', 'A', 'panel', []],
      ['hrB', 'B', 'panel', tpl('hr_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hlp14-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hlp14-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Writers Pvt Ltd', shortName: `KW${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.blr = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const ops = randomUUID();
      ids.ops = (await tx.department.create({ data: { ...x, id: ops, name: 'Operations', code: 'OPS', path: `/${ops}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      const role = await tx.permissionProfile.create({ data: { ...x, name: `hr-entity-${run}`, permissionsJson: JSON.stringify(tpl('hr_admin')) } });
      await tx.roleGrant.create({ data: { ...x, userId: users.hrEntity, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.entity, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Entity HR' } });
    });
    // One employee, so a name in the notes can be recognised.
    await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Meena', familyName: 'Raghunathan', employeeCode: 'KW-001', joinedOn: '2026-04-06', userId: users.staff, workEmail: `staff@hlp14-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.ops, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only policy.manage for the whole company reaches the writer', async () => {
    for (const who of ['hrExec', 'hrEntity', 'staff'] as const) {
      await w(who, 'get').expect(403);
      await w(who, 'post', '/drafts').send(ANSWERS).expect(403);
    }
    const home = (await w('manager', 'get').expect(200)).body;
    expect(home.ai).toBe('on');
    expect(home.latest).toBeNull();
    expect(home.options.types.map((t: { value: string }) => t.value)).toEqual(['leave', 'work_from_home', 'notice']);
    expect(home.options.values.leave.map((v: { key: string }) => v.key)).toEqual(['earned', 'sick', 'casual', 'carry']);
  });

  it('bad input, over-long answers and personal data in the notes are refused before the AI sees anything', async () => {
    const bad = [
      { ...ANSWERS, states: [] },
      { ...ANSWERS, states: ['IN-XX'] },
      { ...ANSWERS, industry: 'casino' },
      { ...ANSWERS, type: 'bonus' },
      { ...ANSWERS, headcount: 0 },
      { ...ANSWERS, earned: 61 },
      { ...ANSWERS, earned: 1.5 },
      { ...ANSWERS, mode: 'magic' },
      { ...ANSWERS, notes: 'x'.repeat(501) },
      { ...ANSWERS, extra: 'field' },
      { ...ANSWERS, earned: undefined },
      { ...ANSWERS, notes: 'Ask hr@kaveri.test about leave.' },
      { ...ANSWERS, notes: 'Call +91 98450 12345 for leave.' },
      { ...ANSWERS, notes: 'Like meena RAGHUNATHAN gets.' },
    ];
    for (const b of bad) await w('manager', 'post', '/drafts').send(b).expect(400);
    expect(fake.prompts).toEqual([]);
  });

  it('a policy manager drafts with the company AI: only the answers go, the output is cleaned, the run is logged', async () => {
    const r = (await w('manager', 'post', '/drafts').send(ANSWERS).expect(201)).body;
    ids.draft = r.id;
    expect(fake.prompts).toHaveLength(1);
    const prompt = fake.prompts[0];
    expect(prompt).toContain('Plant staff work Sundays in season.');
    for (const secret of ['Meena', 'Raghunathan', '@', `HLP14 Org A`, '"15"', ': 15', ': 45']) expect(prompt).not.toContain(secret);
    const v = await view(ids.draft);
    expect(v).toMatchObject({ status: 'draft', mode: 'ai', target: { title: 'Leave policy', policyId: null, number: 1 } });
    const ai = v.clauses.filter((c) => c.source === 'ai');
    expect(ai.map((c) => c.text)).toEqual(['This policy explains leave.', 'Apply in YukthiX before you take leave.', 'YukthiX keeps every request.']);
    expect(JSON.stringify(v.clauses)).not.toMatch(/script|onerror|<img/);
    expect(v.clauses.find((c) => c.id === 'v-earned')).toMatchObject({ source: 'company', editable: false, text: 'Employees earn 15 days of earned leave a year.', finding: 'f-IN-KA-earned' });
    expect(v.clauses.filter((c) => c.source === 'law').map((c) => c.ref)).toEqual(expect.arrayContaining([expect.stringMatching(/^IN\.SE KA /), expect.stringMatching(/^IN\.SE TN /)]));
    // Karnataka's 18 earned days: one open finding with its fix.
    expect(v.findings.filter((f) => f.status === 'open')).toEqual([expect.objectContaining({ id: 'f-IN-KA-earned', fix: { key: 'earned', value: 18 } })]);
    const logs = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'policy.ai_draft_generated' } }));
    expect(logs).toHaveLength(1);
    expect(logs[0].actorUserId).toBe(users.manager);
    const meta = JSON.parse(String(logs[0].metadataJson));
    expect(meta).toMatchObject({ type: 'leave', mode: 'ai', provider: 'anthropic', outcome: 'drafted', clauses: 3, notesGiven: true });
    expect(String(logs[0].metadataJson)).not.toContain('Plant staff');
    // The AI service recorded the spend against the company's credit limit.
    expect(await inA((tx) => tx.aiCreditUsage.count({ where: { organizationId: org.A.id, source: 'policy_writer' } }))).toBe(1);
    expect((await w('manager', 'get').expect(200)).body.latest).toMatchObject({ id: ids.draft, type: 'Leave' });
  });

  it('a failing AI is a clear 503, logged, and makes no draft', async () => {
    fake.answer = async () => {
      throw new Error('provider down');
    };
    const before = await inA((tx) => tx.policyAiDraft.count());
    const r = await w('manager', 'post', '/drafts').send(ANSWERS).expect(503);
    expect(r.body.code).toBe('POLICY_AI_FAILED');
    fake.answer = async () => ({ clauses: [{ title: '<b></b>', text: '' }] });
    await w('manager', 'post', '/drafts').send(ANSWERS).expect(503);
    expect(await inA((tx) => tx.policyAiDraft.count())).toBe(before);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'policy.ai_draft_failed' } }))).toBe(2);
    fake.answer = async () => ({ clauses: CLAUSES });
  });

  it('AI off (company setting or no provider): the page says so and the starters still work', async () => {
    await setting('policy.ai_writer', 'off');
    expect((await w('manager', 'get').expect(200)).body.ai).toBe('off');
    expect((await w('manager', 'post', '/drafts').send(ANSWERS).expect(409)).body.code).toBe('POLICY_AI_OFF');
    const n = fake.prompts.length;
    const s = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', type: 'work_from_home', wfhDays: 2 }).expect(201)).body;
    expect(fake.prompts).toHaveLength(n);
    const v = await view(s.id);
    expect(v.mode).toBe('starter');
    expect(v.clauses.every((c) => c.source !== 'ai')).toBe(true);
    expect(v.findings.map((f) => f.status)).toEqual(['unchecked']);
    await setting('policy.ai_writer', null);
    fake.configured = false;
    expect((await w('manager', 'get').expect(200)).body.ai).toBe('not_set_up');
    expect((await w('manager', 'post', '/drafts').send(ANSWERS).expect(409)).body.code).toBe('POLICY_AI_OFF');
    fake.configured = true;
    expect((await w('manager', 'get').expect(200)).body.ai).toBe('on');
  });

  it('a law finding blocks approval until it is fixed; a number typed into a clause blocks too', async () => {
    let v = await view(ids.draft);
    expect((await w('manager', 'post', `/drafts/${ids.draft}/approve`).send({ version: v.version }).expect(409)).body.code).toBe('POLICY_LAW_FINDINGS');
    // Use the legal minimum.
    const saved = (await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, earned: 18 }).expect(200)).body;
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, earned: 18 }).expect(409); // stale
    v = await view(ids.draft);
    expect(v.version).toBe(saved.version);
    expect(v.openFindings).toBe(0);
    expect(v.clauses.find((c) => c.id === 'v-earned')!.text).toBe('Employees earn 18 days of earned leave a year.');
    // A number slipped into a prose clause (and markup) is cleaned and found.
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, clauses: [{ id: 'p2', text: 'Apply 2 days ahead.<script>x()</script>' }] }).expect(200);
    v = await view(ids.draft);
    expect(v.clauses.find((c) => c.id === 'p2')).toMatchObject({ text: 'Apply 2 days ahead.', finding: 'f-num-p2' });
    expect((await w('manager', 'post', `/drafts/${ids.draft}/approve`).send({ version: v.version }).expect(409)).body.code).toBe('POLICY_LAW_FINDINGS');
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, clauses: [{ id: 'p2', text: 'Apply in YukthiX before you take leave.' }] }).expect(200);
    // Bad edits: unknown clause, empty text, a rule line, a number out of range.
    v = await view(ids.draft);
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, clauses: [{ id: 'p9', text: 'x' }] }).expect(400);
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, clauses: [{ id: 'p1', text: '<b></b>' }] }).expect(400);
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, clauses: [{ id: 'v-earned', text: 'Employees earn 1 day.' }] }).expect(400);
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, earned: 99 }).expect(400);
    expect((await view(ids.draft)).openFindings).toBe(0);
  });

  it('another company gets Not found; acting for someone else is refused', async () => {
    const v = await view(ids.draft);
    await w('hrB', 'get', `/drafts/${ids.draft}`).expect(404);
    await w('hrB', 'put', `/drafts/${ids.draft}`).send({ version: v.version, earned: 20 }).expect(404);
    await w('hrB', 'post', `/drafts/${ids.draft}/approve`).send({ version: v.version }).expect(404);
    expect((await w('hrB', 'get').expect(200)).body.latest).toBeNull();
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.manager}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    await w('acting', 'post', '/drafts').send(ANSWERS).expect(403);
    await w('acting', 'put', `/drafts/${ids.draft}`).send({ version: v.version, earned: 20 }).expect(403);
    await w('acting', 'post', `/drafts/${ids.draft}/approve`).send({ version: v.version }).expect(403);
    expect((await view(ids.draft)).version).toBe(v.version);
  });

  it('one manager approves; the version waits in the library; the approver can never publish it; a second person does', async () => {
    let v = await view(ids.draft);
    await w('manager', 'post', `/drafts/${ids.draft}/approve`).send({ version: v.version - 1 }).expect(409);
    const a = (await w('manager', 'post', `/drafts/${ids.draft}/approve`).send({ version: v.version }).expect(201)).body;
    expect(a).toMatchObject({ title: 'Leave policy', code: 'POL-01', number: 1 });
    ids.pol = a.policyId;
    await w('manager', 'post', `/drafts/${ids.draft}/approve`).send({ version: v.version + 1 }).expect(409); // a repeat
    v = await view(ids.draft);
    expect(v).toMatchObject({ status: 'approved', approvedByMe: true, target: { policyId: ids.pol, number: 1 } });
    expect(v.clauses.every((c) => !c.editable)).toBe(true);
    await w('manager', 'put', `/drafts/${ids.draft}`).send({ version: v.version, earned: 20 }).expect(409);

    const d = (await desk('manager', 'get', `/policies/${ids.pol}`).expect(200)).body;
    expect(d.open).toMatchObject({ number: 1, status: 'waiting', needsSecondPerson: true, writtenByMe: true });
    expect(d.open.bodyHtml).toContain('<h3>Earned leave</h3><p>Employees earn 18 days of earned leave a year.</p>');
    expect(d.open.bodyHtml).not.toMatch(/script|onerror/);
    // Even with the company's second-person setting off, the approver cannot publish (API and database).
    await setting('policy.publish.second_person', 'off');
    expect((await desk('manager', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open.version }).expect(403)).body.code).toBe('POLICY_SECOND_PERSON');
    await expect(inA((tx) => tx.policyVersion.update({ where: { id: d.open.id }, data: { status: 'published', publishedBy: users.manager, publishedAt: new Date(), effectiveOn: new Date(), bodySha256: 'a'.repeat(64) } }))).rejects.toThrow(/policy_versions_ai_approver_check|check/i);
    await expect(inA((tx) => tx.policyVersion.update({ where: { id: d.open.id }, data: { needsSecondPerson: false } }))).rejects.toThrow(/check/i);
    await setting('policy.publish.second_person', null);
    // The second person sees it as someone else's and publishes it: version 1 in the history.
    const seen = (await desk('second', 'get', `/policies/${ids.pol}`).expect(200)).body;
    expect(seen.open.writtenByMe).toBe(false);
    await desk('second', 'post', `/policies/${ids.pol}/publish`).send({ version: seen.open.version }).expect(201);
    const after = (await desk('second', 'get', `/policies/${ids.pol}`).expect(200)).body;
    expect(after.current).toMatchObject({ number: 1 });
    expect(after.open).toBeNull();
    // An approved draft never changes, even in the database.
    await expect(inA((tx) => tx.policyAiDraft.update({ where: { id: ids.draft }, data: { status: 'draft' } }))).rejects.toThrow(/never changes/);
  });

  it('a second AI draft of the same policy becomes its next version, with a change summary', async () => {
    const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, earned: 18 }).expect(201)).body;
    const v = await view(r.id);
    expect(v.openFindings).toBe(0);
    expect(v.target).toMatchObject({ policyId: ids.pol, number: 2 });
    // The other policy manager approves this one; then the first one may publish it, the approver may not.
    await w('second', 'post', `/drafts/${r.id}/approve`).send({ version: v.version }).expect(201);
    const d = (await desk('second', 'get', `/policies/${ids.pol}`).expect(200)).body;
    expect(d.open).toMatchObject({ number: 2, status: 'waiting', changeSummary: expect.stringContaining('Write policies with AI') });
    await desk('second', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open.version }).expect(403);
    await desk('manager', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open.version }).expect(201);
    // While a version is being written, a new draft cannot be approved into the same policy.
    await desk('manager', 'put', `/policies/${ids.pol}/draft`).send({ bodyHtml: '<p>Manual change.</p>', changeSummary: 'Manual.' }).expect(200);
    const third = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, earned: 18 }).expect(201)).body;
    const t = await view(third.id);
    expect((await w('manager', 'post', `/drafts/${third.id}/approve`).send({ version: t.version }).expect(409)).body.code).toBe('POLICY_VERSION_OPEN');
  });
});
