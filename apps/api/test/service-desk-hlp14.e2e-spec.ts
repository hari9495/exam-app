process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { AiApiKeyResolverService, AiNotConfiguredError, BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { PolicyWriterService } from '../src/policies/policy-writer.service';
import { factsOn, statutoryOn } from '../src/time/time-core';
import { OvertimeService } from '../src/time/overtime.service';
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
  type Who = 'adminA' | 'manager' | 'second' | 'hrExec' | 'hrEntity' | 'staff' | 'hrB' | 'acting' | 'fw' | 'ow' | 'bw';
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
  const ANSWERS = { mode: 'ai', type: 'leave', industry: 'it_services', states: ['IN-KA', 'IN-TN'], headcount: 248, workPattern: 'shift', earned: 15, sick: 12, casual: 12, carry: 45, notes: 'Plant staff work Sundays in season.' };
  type View = { id: string; status: string; version: number; discardReason?: string | null; discardedBy?: string | null; counselNote?: string | null; mode: string; values: Record<string, number>; clauses: { id: string; title: string; text: string; source: string; ref?: string; editable: boolean; finding?: string }[]; findings: { id: string; status: string; text: string; state?: string; fix?: { key: string; value: number } }[]; openFindings: number; target: { title: string; policyId: string | null; number: number }; approvedByMe: boolean };
  // Platform data (industries, law tables) is written with the schema owner, never the app role (which only reads it).
  const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  const IND = `t${run}`;
  const STATUTE = `IN.T${run}`;
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
      ['fw', 'A', 'panel', []],
      ['ow', 'A', 'panel', []],
      ['bw', 'B', 'panel', []],
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
    // The test industry (a platform row: the owner connection, as a platform admin would add one).
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      await tx.$executeRaw`DELETE FROM policy_industries WHERE code = ${IND}`;
    });
    await owner.$disconnect();
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
    expect(home.options.types.map((t: { value: string }) => t.value)).toEqual(['leave', 'work_from_home', 'notice', 'conduct', 'posh']);
    // Industries come from the table (answer: no deploy for a new one); probation starts at the company default.
    expect(home.options.industries.slice(0, 3).map((i: { value: string }) => i.value)).toEqual(['manufacturing', 'fmcg', 'it_services']);
    expect(home.options.values.notice.find((v: { key: string }) => v.key === 'probationMonths').default).toBe(6);
    await setting('probation.default_months', '9');
    expect((await w('manager', 'get').expect(200)).body.options.values.notice.find((v: { key: string }) => v.key === 'probationMonths').default).toBe(9);
    await setting('probation.default_months', null);
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
    // The industry's own rules are not checked: the note travels with the version; the publisher must tick it.
    expect(seen.open.counselNote).toBe('Law check covers general labour law only; IT services rules are not checked yet; review with counsel');
    expect((await desk('second', 'post', `/policies/${ids.pol}/publish`).send({ version: seen.open.version }).expect(400)).body.code).toBe('POLICY_COUNSEL_UNSEEN');
    await desk('second', 'post', `/policies/${ids.pol}/publish`).send({ version: seen.open.version, counselSeen: false }).expect(400);
    await expect(inA((tx) => tx.policyVersion.update({ where: { id: seen.open.id }, data: { status: 'published', publishedBy: users.second, publishedAt: new Date(), effectiveOn: new Date(), bodySha256: 'a'.repeat(64) } }))).rejects.toThrow(/check/i);
    await desk('second', 'post', `/policies/${ids.pol}/publish`).send({ version: seen.open.version, counselSeen: true }).expect(201);
    const seenLog = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'policy.counsel_note_seen', entityId: seen.open.id } }));
    expect(seenLog).toHaveLength(1);
    expect(seenLog[0].actorUserId).toBe(users.second);
    expect(await inA((tx) => tx.policyVersion.findUnique({ where: { id: seen.open.id }, select: { counselSeenBy: true } }))).toEqual({ counselSeenBy: users.second });
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
    await desk('manager', 'post', `/policies/${ids.pol}/publish`).send({ version: d.open.version, counselSeen: true }).expect(201);
    // While a version is being written, a new draft cannot be approved into the same policy.
    await desk('manager', 'put', `/policies/${ids.pol}/draft`).send({ bodyHtml: '<p>Manual change.</p>', changeSummary: 'Manual.' }).expect(200);
    const third = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, earned: 18 }).expect(201)).body;
    const t = await view(third.id);
    expect((await w('manager', 'post', `/drafts/${third.id}/approve`).send({ version: t.version }).expect(409)).body.code).toBe('POLICY_VERSION_OPEN');
  });

  // ---------------------------------------------------------------------------------------------- round 2

  it('discard: the manager sets an unapproved draft aside (audited); nothing more happens to it; others are refused', async () => {
    const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter' }).expect(201)).body;
    const v = await view(r.id);
    await w('hrExec', 'post', `/drafts/${r.id}/discard`).send({ version: v.version }).expect(403);
    await w('hrB', 'post', `/drafts/${r.id}/discard`).send({ version: v.version }).expect(404);
    await w('acting', 'post', `/drafts/${r.id}/discard`).send({ version: v.version }).expect(403);
    await w('manager', 'post', `/drafts/${r.id}/discard`).send({ version: v.version + 1 }).expect(409);
    await w('manager', 'post', `/drafts/${r.id}/discard`).send({}).expect(400);
    expect((await w('manager', 'post', `/drafts/${r.id}/discard`).send({ version: v.version }).expect(201)).body).toEqual({ status: 'discarded' });
    const after = await view(r.id);
    expect(after).toMatchObject({ status: 'discarded', discardReason: 'manual', discardedBy: `manager ${run}` });
    expect(after.clauses.every((c) => !c.editable)).toBe(true);
    await w('manager', 'post', `/drafts/${r.id}/discard`).send({ version: after.version }).expect(409);
    await w('manager', 'put', `/drafts/${r.id}`).send({ version: after.version, earned: 20 }).expect(409);
    await w('manager', 'post', `/drafts/${r.id}/approve`).send({ version: after.version }).expect(409);
    expect((await w('manager', 'get').expect(200)).body.latest?.id).not.toBe(r.id);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'policy.ai_draft_discarded', entityId: r.id } }))).toBe(1);
    await expect(inA((tx) => tx.policyAiDraft.update({ where: { id: r.id }, data: { status: 'draft' } }))).rejects.toThrow(/never changes/);
  });

  it('clean-up: drafts untouched for the company days (setting, default 90) are discarded once; younger ones stay', async () => {
    await setting('policy.ai_draft.discard_days', '30');
    const oldOne = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter' }).expect(201)).body.id as string;
    const young = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter' }).expect(201)).body.id as string;
    await inA((tx) => tx.$executeRaw`UPDATE policy_ai_drafts SET updated_at = now() - interval '31 days' WHERE id = ${oldOne}::uuid`);
    await inA((tx) => tx.$executeRaw`UPDATE policy_ai_drafts SET updated_at = now() - interval '29 days' WHERE id = ${young}::uuid`);
    const writer = app.get(PolicyWriterService);
    expect(await writer.discardExpired(new Date(), org.A.id)).toBe(1);
    expect((await view(oldOne)).status).toBe('discarded');
    expect((await view(oldOne)).discardReason).toBe('expired');
    expect((await view(young)).status).toBe('draft');
    const n = await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'policy.ai_draft_discarded', entityId: oldOne } }));
    expect(n).toBe(1);
    await writer.discardExpired(new Date(), org.A.id);
    expect(await inA((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'policy.ai_draft_discarded', entityId: oldOne } }))).toBe(1);
    // At the default (90 days) the 31-day-old kind of draft would stay.
    await setting('policy.ai_draft.discard_days', null);
    await inA((tx) => tx.$executeRaw`UPDATE policy_ai_drafts SET updated_at = now() - interval '89 days' WHERE id = ${young}::uuid`);
    await writer.discardExpired(new Date(), org.A.id);
    expect((await view(young)).status).toBe('draft');
  });

  it('POSH follows IN.POSH (committee make-up, time limits, verify); a short committee blocks until fixed', async () => {
    const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', type: 'posh', icMembers: 3, womenMembers: 1 }).expect(201)).body;
    let v = await view(r.id);
    expect(v.clauses.filter((c) => c.source === 'law').map((c) => c.ref)).toEqual(['IN.POSH 2013-v2 (verify)', 'IN.POSH 2013-v2 (verify)']);
    expect(v.clauses.find((c) => c.id === 'law-posh-time')!.text).toContain('within 90 days');
    expect(v.findings.filter((f) => f.status === 'open').map((f) => f.id)).toEqual(['f-posh-size', 'f-posh-women']);
    expect((await w('manager', 'post', `/drafts/${r.id}/approve`).send({ version: v.version }).expect(409)).body.code).toBe('POLICY_LAW_FINDINGS');
    await w('manager', 'put', `/drafts/${r.id}`).send({ version: v.version, icMembers: 4, womenMembers: 5 }).expect(400);
    await w('manager', 'put', `/drafts/${r.id}`).send({ version: v.version, icMembers: 4, womenMembers: 2 }).expect(200);
    v = await view(r.id);
    expect(v.openFindings).toBe(0);
    const a = (await w('manager', 'post', `/drafts/${r.id}/approve`).send({ version: v.version }).expect(201)).body;
    expect(a).toMatchObject({ title: 'Prevention of sexual harassment (POSH) policy', number: 1 });
    await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', type: 'posh', icMembers: 21, womenMembers: 2 }).expect(400);
  });

  it('code of conduct: the company AI drafts it; no law table (counsel); same approval path', async () => {
    const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, type: 'conduct', notes: undefined }).expect(201)).body;
    const v = await view(r.id);
    expect(v.clauses.every((c) => c.source === 'ai')).toBe(true);
    expect(v.findings.map((f) => f.status)).toEqual(['unchecked']);
    expect((await w('manager', 'post', `/drafts/${r.id}/approve`).send({ version: v.version }).expect(201)).body.title).toBe('Code of conduct');
  });

  it('Maharashtra, Telangana and Delhi leave tables (verify) are checked; a rate stays unchecked', async () => {
    const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', states: ['IN-MH', 'IN-TS', 'IN-DL'], earned: 12, sick: 12, casual: 7, carry: 60 }).expect(201)).body;
    const v = await view(r.id);
    const by = (id: string) => v.findings.find((f) => f.id === id);
    expect(by('f-IN-MH-casual')).toMatchObject({ status: 'open', fix: { key: 'casual', value: 8 } });
    expect(by('f-IN-MH-note1')).toMatchObject({ status: 'unchecked' });
    expect(by('f-IN-TS-earned')).toMatchObject({ status: 'open', fix: { key: 'earned', value: 15 } });
    expect(by('f-IN-TS-casual')).toMatchObject({ status: 'open', fix: { key: 'casual', value: 12 } });
    expect(by('f-IN-DL-earned')).toMatchObject({ status: 'open', fix: { key: 'earned', value: 15 } });
    expect(by('f-IN-DL-casual-sick')).toMatchObject({ status: 'resolved' });
    expect(v.clauses.filter((c) => c.source === 'law' && c.ref?.startsWith('IN.SE')).every((c) => c.ref!.endsWith('(verify)'))).toBe(true);
  });

  it('a new industry needs no deploy; with its own leave table it is checked and carries no counsel note; an inactive or unknown one is refused', async () => {
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      await tx.$executeRaw`INSERT INTO statutory_rule_sets (statute, jurisdiction, version, valid_from, values, source, verify) VALUES (${STATUTE}, 'IN', 'e2e', '2026-01-01', ${JSON.stringify({ floors: [{ kinds: ['earned'], days: 21 }] })}::jsonb, 'HLP-14 e2e test table.', true)`;
      await tx.$executeRaw`INSERT INTO policy_industries (code, label, law_statutes, sort) VALUES (${IND}, ${`Mines ${run}`}, ARRAY[${STATUTE}]::varchar[], 5)`;
    });
    expect((await w('manager', 'get').expect(200)).body.options.industries[0]).toEqual({ value: IND, label: `Mines ${run}` });
    const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', industry: IND, earned: 18 }).expect(201)).body;
    let v = await view(r.id);
    expect(v.findings.find((f) => f.id === `f-ind-${STATUTE}-IN-earned`)).toMatchObject({ status: 'open', fix: { key: 'earned', value: 21 } });
    expect((v as unknown as { counselNote: string | null }).counselNote).toBeNull();
    await w('manager', 'put', `/drafts/${r.id}`).send({ version: v.version, earned: 21 }).expect(200);
    v = await view(r.id);
    expect(v.openFindings).toBe(0);
    // The same industry for a notice policy: its table says nothing about notice, so the note shows.
    const n = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', type: 'notice', industry: IND, noticeDays: 30, probationMonths: 6 }).expect(201)).body;
    expect(((await view(n.id)) as unknown as { counselNote: string }).counselNote).toBe(`Law check covers general labour law only; Mines ${run} rules are not checked yet; review with counsel`);
    await owner.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      await tx.$executeRaw`UPDATE policy_industries SET active = false WHERE code = ${IND}`;
    });
    expect((await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', industry: IND }).expect(400)).body.code).toBe('POLICY_INDUSTRY_UNKNOWN');
    expect((await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', industry: 'no_such_one' }).expect(400)).body.code).toBe('POLICY_INDUSTRY_UNKNOWN');
    await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', industry: 'Bad Code!' }).expect(400);
    // The app role can never write the industry list.
    await expect(prisma.$executeRaw`INSERT INTO policy_industries (code, label) VALUES ('hack', 'Hack')`).rejects.toThrow();
  });

  // ---------------------------------------------------------------------------------------------- answer 111

  it('Manufacturing and Food and consumer goods: the factory leave table (verify) is checked for leave; no counsel note', async () => {
    for (const industry of ['manufacturing', 'fmcg']) {
      const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', industry, carry: 20 }).expect(201)).body;
      let v = await view(r.id);
      const label = industry === 'fmcg' ? 'Food and consumer goods' : 'Manufacturing';
      expect(v.counselNote).toBeNull();
      // The carry-forward minimum is a number in the Act: checked, with the fix. The yearly leave is a rate: ask counsel.
      expect(v.findings.find((f) => f.id === 'f-ind-IN.FACTORIES.LEAVE-IN-carry')).toMatchObject({ state: label, status: 'open', fix: { key: 'carry', value: 30 } });
      expect(v.findings.find((f) => f.id === 'f-ind-IN.FACTORIES.LEAVE-IN-note1')).toMatchObject({ state: label, status: 'unchecked' });
      expect(v.findings.some((f) => f.status === 'open' && /factory|twenty days/i.test(f.text))).toBe(false);
      const line = v.clauses.find((c) => c.id === 'law-ind-IN.FACTORIES.LEAVE-IN')!;
      expect(line).toMatchObject({ source: 'law', ref: 'IN.FACTORIES.LEAVE IN 2020-v1 (verify)', title: `${label} rules` });
      expect(line.text).toBe(`The ${label.toLowerCase()} rules give at least 30 days of unused earned leave to carry forward. Where this policy gives more, the policy applies.`);
      // Karnataka's own carry forward (30) is open too; raising it to 30 clears both.
      await w('manager', 'put', `/drafts/${r.id}`).send({ version: v.version, carry: 30, earned: 18 }).expect(200);
      v = await view(r.id);
      expect(v.openFindings).toBe(0);
    }
  });

  it('the factory table covers leave policies only: other policy types and other industries keep the counsel note', async () => {
    const wfh = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', type: 'work_from_home', industry: 'manufacturing', wfhDays: 2 }).expect(201)).body;
    expect((await view(wfh.id)).counselNote).toBe('Law check covers general labour law only; Manufacturing rules are not checked yet; review with counsel');
    const it = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter' }).expect(201)).body;
    const v = await view(it.id);
    expect(v.counselNote).toBe('Law check covers general labour law only; IT services rules are not checked yet; review with counsel');
    expect(v.findings.some((f) => f.id.startsWith('f-ind-'))).toBe(false);
  });

  it('a leave draft dated before the OSH Code would read the Factories Act row; today reads the OSH Code row', async () => {
    const rows = await prisma.statutoryRuleSet.findMany({ where: { statute: 'IN.FACTORIES.LEAVE' }, orderBy: { validFrom: 'asc' } });
    expect(rows.map((r) => [r.version, r.validTo?.toISOString().slice(0, 10) ?? null, r.verify])).toEqual([['1948-v1', '2025-11-20', true], ['2020-v1', null, true]]);
    expect(rows[0].source).toMatch(/Factories Act, 1948: s\.79\(1\)/);
    expect(rows[1].source).toMatch(/OSH Code 2020, s\.32/);
  });

  // ---------------------------------------------------------------------------------------------- answers 131, 132

  it('132: the company industry is a setting from the platform list (default none); the writer starts from it', async () => {
    const reg = (await request(server()).get('/api/v1/org/settings').set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.registry['company.industry'];
    expect(reg).toMatchObject({ default: 'none', labels: { none: 'Not chosen', manufacturing: 'Manufacturing' } });
    expect(reg.values.slice(0, 3)).toEqual(['none', 'manufacturing', 'fmcg']);
    expect((await w('manager', 'get').expect(200)).body.defaults).toEqual({ industry: null });
    const put = (who: Who, value: string) => request(server()).put('/api/v1/org/settings').set('Authorization', `Bearer ${token[who]}`).send({ key: 'company.industry', value, scopeType: 'tenant' });
    await put('adminA', 'casino').expect(400);
    await put('adminA', IND).expect(400); // switched off in the earlier test
    await put('staff', 'manufacturing').expect(403);
    await put('adminA', 'manufacturing').expect(200);
    expect((await w('manager', 'get').expect(200)).body.defaults).toEqual({ industry: 'manufacturing' });
    // Another company keeps its own (none).
    expect((await w('hrB', 'get').expect(200)).body.defaults).toEqual({ industry: null });
    // A draft can still choose another industry.
    const r = (await w('manager', 'post', '/drafts').send({ ...ANSWERS, mode: 'starter', industry: 'retail' }).expect(201)).body;
    expect((await view(r.id)).counselNote).toMatch(/Retail and shops rules are not checked yet/);
    await put('adminA', 'none').expect(200);
    expect((await w('manager', 'get').expect(200)).body.defaults).toEqual({ industry: null });
  });

  describe('131: Time applies the factory carry-forward minimum at registered factories only', () => {
    const LY = `${Number(new Date().toISOString().slice(0, 4)) - 1}-12-31`;
    const loc = (name: string, code: string, registeredFactory?: unknown) => ({ legalEntityId: ids.entity, name, code, address: { lines: ['Plot 4, GIDC'], city: 'Vapi', state: 'IN-GJ', country: 'IN' }, timezone: 'Asia/Kolkata', ...(registeredFactory === undefined ? {} : { registeredFactory }) });
    const v1 = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
    const yearEnd = async () => (await v1('manager', 'get', `/time/setup/year-end?yearEnd=${LY}`).expect(200)).body.rows as { employeeId: string; carry: number; lapse: number }[];
    const P = () => `VP${run.slice(0, 4)}`;
    const O = () => `VO${run.slice(0, 4)}`;

    it('the flag is set with the location, audited; others are refused', async () => {
      // Gujarat has no state leave table, so only the factory table can raise the carry forward.
      ids.factory = (await v1('adminA', 'post', '/org/locations').send(loc('Vapi plant', P(), true)).expect(201)).body.id;
      ids.office = (await v1('adminA', 'post', '/org/locations').send(loc('Vapi office', O())).expect(201)).body.id;
      const all = (await v1('adminA', 'get', '/org/locations').expect(200)).body as { id: string; registeredFactory: boolean }[];
      expect(all.find((l) => l.id === ids.factory)!.registeredFactory).toBe(true);
      expect(all.find((l) => l.id === ids.office)!.registeredFactory).toBe(false);
      await v1('adminA', 'put', `/org/locations/${ids.office}`).send(loc('Vapi office', O(), 'yes')).expect(400);
      await v1('staff', 'put', `/org/locations/${ids.office}`).send(loc('Vapi office', O(), true)).expect(403);
      await v1('hrB', 'put', `/org/locations/${ids.office}`).send(loc('Vapi office', O(), true)).expect(404);
      expect((await v1('adminA', 'get', '/org/locations').expect(200)).body.find((l: { id: string }) => l.id === ids.office).registeredFactory).toBe(false);
      // Saving the form without the field keeps the flag.
      await v1('adminA', 'put', `/org/locations/${ids.factory}`).send(loc('Vapi plant', P())).expect(200);
      expect((await v1('adminA', 'get', '/org/locations').expect(200)).body.find((l: { id: string }) => l.id === ids.factory).registeredFactory).toBe(true);
    });

    it('year end: 40 days at the factory carry 30 (raised from the policy 10); at the office 10; switching the flag moves it', async () => {
      ids.EL = (await v1('manager', 'post', '/time/setup/types').send({ code: 'EL', name: 'Earned leave', kind: 'earned', paid: true, rules: { halfDays: true } }).expect(201)).body.id;
      ids.leavePolicy = (await v1('manager', 'post', '/time/setup/policies').send({ name: `Staff ${run}` }).expect(201)).body.id;
      await v1('manager', 'post', `/time/setup/policies/${ids.leavePolicy}/versions`).send({ validFrom: '2024-01-01', lines: [{ leaveTypeId: ids.EL, annualDays: 0, frequency: 'yearly', proRata: false, rounding: 0.5, carryForwardMax: 10 }] }).expect(201);
      await v1('manager', 'post', `/time/setup/policies/${ids.leavePolicy}/assign`).send({ scopeType: 'legal_entity', scopeId: ids.entity, validFrom: '2024-01-01' }).expect(201);
      const hire = async (given: string, code: string, locationId: string, userId?: string) => (await v1('adminA', 'post', '/people/employees').send({ ...(userId ? { userId } : {}), legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: 'Patel', employeeCode: code.toUpperCase(), joinedOn: '2024-01-01', overrideReason: 'Joined before the system went live', workEmail: userId === users.fw ? `fw@hlp14-${run}.test` : userId === users.ow ? `ow@hlp14-${run}.test` : `${code.toLowerCase()}@hlp14-${run}.test`, assignment: { locationId, departmentId: ids.ops, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).then((r) => (r.status === 201 ? r : Promise.reject(new Error(JSON.stringify(r.body)))))).body.id as string;
      ids.fEmp = await hire('Hetal', `KW-F${run.slice(0, 3)}`, ids.factory, users.fw);
      ids.oEmp = await hire('Jignesh', `KW-O${run.slice(0, 3)}`, ids.office, users.ow);
      for (const e of [ids.fEmp, ids.oEmp]) await inA((tx) => tx.leaveLedgerEntry.create({ data: { organizationId: org.A.id, employeeId: e, leaveTypeId: ids.EL, entryOn: new Date(`${LY.slice(0, 4)}-06-30T00:00:00Z`), kind: 'adjustment', days: 40, reason: 'Last year' } }));
      let rows = await yearEnd();
      expect(rows.find((r) => r.employeeId === ids.fEmp)).toMatchObject({ carry: 30, lapse: 10 });
      expect(rows.find((r) => r.employeeId === ids.oEmp)).toMatchObject({ carry: 10, lapse: 30 });
      // The set-up page names the rule set the factory minimum comes from.
      const st = (await v1('manager', 'get', '/time/setup').expect(200)).body.statutory as { statute: string; version: string; values: { carry?: { earned?: number } } }[];
      expect(st.filter((x) => x.statute === 'IN.FACTORIES.LEAVE')).toEqual([expect.objectContaining({ version: '2020-v1', values: expect.objectContaining({ carry: { earned: 30 } }) })]);
      // Flag off: the factory is treated as an office; on again: back to 30.
      await v1('adminA', 'put', `/org/locations/${ids.factory}`).send(loc('Vapi plant', P(), false)).expect(200);
      rows = await yearEnd();
      expect(rows.find((r) => r.employeeId === ids.fEmp)).toMatchObject({ carry: 10, lapse: 30 });
      expect(((await v1('manager', 'get', '/time/setup').expect(200)).body.statutory as { statute: string }[]).some((x) => x.statute === 'IN.FACTORIES.LEAVE')).toBe(false);
      await v1('adminA', 'put', `/org/locations/${ids.factory}`).send(loc('Vapi plant', P(), true)).expect(200);
      expect((await yearEnd()).find((r) => r.employeeId === ids.fEmp)).toMatchObject({ carry: 30 });
      const logs = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'org.location.factory_changed', entityId: ids.factory }, orderBy: { createdAt: 'asc' } }));
      expect(logs.map((l) => JSON.parse(String(l.metadataJson)))).toEqual([expect.objectContaining({ from: true, to: false }), expect.objectContaining({ from: false, to: true })]);
      expect(logs[0].actorUserId).toBe(users.adminA);
      // No Time key, and another company, see nothing of it.
      await v1('staff', 'get', `/time/setup/year-end?yearEnd=${LY}`).expect(403);
      expect((await v1('hrB', 'get', `/time/setup/year-end?yearEnd=${LY}`).expect(200)).body.rows).toEqual([]);
    });

    it('the dated row valid on the date applies: Factories Act before 21 Nov 2025, OSH Code after, nothing before 1949; never at an office', async () => {
      const at = (on: string, factory: boolean) => inA((tx) => statutoryOn(tx, 'IN-GJ', on, factory));
      expect((await at('2025-06-30', true)).rules).toEqual(['IN.FACTORIES.LEAVE IN 1948-v1']);
      expect((await at('2025-11-20', true)).rules).toEqual(['IN.FACTORIES.LEAVE IN 1948-v1']);
      expect((await at('2025-11-21', true)).rules).toEqual(['IN.FACTORIES.LEAVE IN 2020-v1']);
      expect((await at('2026-06-30', true)).carry).toEqual({ earned: 30 });
      expect(await at('1940-12-31', true)).toMatchObject({ carry: {}, rules: [] });
      expect(await at('2026-06-30', false)).toMatchObject({ carry: {}, rules: [] });
      // A state table and the factory table together: the higher carry forward wins, both named.
      const tn = await inA((tx) => statutoryOn(tx, 'IN-TN', '2026-06-30', true));
      expect(tn.carry.earned).toBe(30);
      expect(tn.rules).toEqual([expect.stringMatching(/^IN\.SE IN-TN /), 'IN.FACTORIES.LEAVE IN 2020-v1']);
    });
    it('141: the flag is the single source for overtime and the 240-day rule; a department or employment type can be excluded', async () => {
      const ot = app.get(OvertimeService);
      const on = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
      const covered = async (employeeId: string) => inA(async (tx) => (await ot.planHints(tx, org.A.id, (await factsOn(tx, org.A.id, employeeId, on))!, on)).factoriesAct);
      const elBlock = async (who: Who) => ((await v1(who, 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.EL, from: on, to: on }).expect(200)).body.blocks as string[]).find((b) => /Earned leave in a factory/.test(b)) ?? null;
      const setFa = (scopeType: string, scopeId: string, value: string) => inA(async (tx) => {
        await tx.setting.deleteMany({ where: { organizationId: org.A.id, key: 'attendance.factories_act', scopeType, scopeId } });
        if (value) await tx.setting.create({ data: { organizationId: org.A.id, key: 'attendance.factories_act', scopeType, scopeId, value, validFrom: new Date('2024-01-01T00:00:00Z') } });
      });
      // The plant is a registered factory: overtime is paid by law and earned leave needs 240 days worked last year.
      expect(await covered(ids.fEmp)).toBe(true);
      expect(await elBlock('fw')).toMatch(/needs \d+ days worked/);
      // The office is not flagged and no setting applies: neither rule.
      expect(await covered(ids.oEmp)).toBe(false);
      expect(await elBlock('ow')).toBeNull();
      // Even a company-wide "not covered" does not undo the flag.
      await setFa('tenant', org.A.id, 'not_covered');
      expect(await covered(ids.fEmp)).toBe(true);
      // An employment type set to not covered is excluded at the factory (office staff on a factory site).
      await setFa('employment_type', ids.perm, 'not_covered');
      expect(await covered(ids.fEmp)).toBe(false);
      expect(await elBlock('fw')).toBeNull();
      await setFa('employment_type', ids.perm, '');
      // A department excluded the same way.
      await setFa('department', ids.ops, 'not_covered');
      expect(await covered(ids.fEmp)).toBe(false);
      await setFa('department', ids.ops, '');
      await setFa('tenant', org.A.id, '');
      expect(await covered(ids.fEmp)).toBe(true);
      // Flag off: back to the setting alone (none here), so not covered.
      await v1('adminA', 'put', `/org/locations/${ids.factory}`).send(loc('Vapi plant', P(), false)).expect(200);
      expect(await covered(ids.fEmp)).toBe(false);
      expect(await elBlock('fw')).toBeNull();
      // A value set before the flag existed still works where nothing is flagged (no silent change).
      await setFa('location', ids.office, 'covered');
      expect(await covered(ids.oEmp)).toBe(true);
      expect(await elBlock('ow')).toMatch(/needs \d+ days worked/);
      await setFa('location', ids.office, '');
      await v1('adminA', 'put', `/org/locations/${ids.factory}`).send(loc('Vapi plant', P(), true)).expect(200);
      // Time set-up says where coverage comes from, with the exclusions listed.
      await setFa('employment_type', ids.perm, 'not_covered');
      const locs = (await v1('manager', 'get', '/time/setup').expect(200)).body.locations as { id: string; factoriesAct: { covered: boolean; source: string; exclusions: { scopeType: string; name: string }[] } }[];
      expect(locs.find((l) => l.id === ids.factory)!.factoriesAct).toEqual({ covered: true, source: 'registered_factory', scopeType: null, exclusions: [{ scopeType: 'employment_type', name: 'Permanent' }], locationSetting: null });
      expect(locs.find((l) => l.id === ids.office)!.factoriesAct).toMatchObject({ covered: false, source: 'default', exclusions: [] });
      await setFa('employment_type', ids.perm, '');
      // Another company: its people and set-up are untouched by company A's flag.
      expect(((await v1('hrB', 'get', '/time/setup').expect(200)).body.locations as { id: string }[]).some((l) => l.id === ids.factory)).toBe(false);
      await v1('bw', 'post', '/time/me/leave/preview').send({ leaveTypeId: ids.EL, from: on, to: on }).expect(404);
    });
    it('151: an old location-level "covered" value: the pages say mark it; once flagged, no longer needed; nothing moves by itself', async () => {
      const setFa = (scopeId: string, value: string) => inA(async (tx) => {
        await tx.setting.deleteMany({ where: { organizationId: org.A.id, key: 'attendance.factories_act', scopeType: 'location', scopeId } });
        if (value) await tx.setting.create({ data: { organizationId: org.A.id, key: 'attendance.factories_act', scopeType: 'location', scopeId, value, validFrom: new Date('2024-01-01T00:00:00Z') } });
      });
      const orgLoc = async () => (await v1('adminA', 'get', '/org/locations').expect(200)).body.find((l: { id: string }) => l.id === ids.office) as { registeredFactory: boolean; factoriesActSetting: string | null };
      const timeLoc = async () => ((await v1('manager', 'get', '/time/setup').expect(200)).body.locations as { id: string; factoriesAct: { source: string; locationSetting: string | null } }[]).find((l) => l.id === ids.office)!.factoriesAct;
      const override = async () => ((await v1('adminA', 'get', '/org/settings').expect(200)).body.overrides as { key: string; scopeId: string; noLongerNeeded?: string }[]).find((o) => o.key === 'attendance.factories_act' && o.scopeId === ids.office);
      // No value: nothing to say.
      expect((await orgLoc()).factoriesActSetting).toBeNull();
      expect((await timeLoc()).locationSetting).toBeNull();
      // An old "covered" value and no flag: both pages see it; nothing is flagged by itself.
      await setFa(ids.office, 'covered');
      expect(await orgLoc()).toMatchObject({ registeredFactory: false, factoriesActSetting: 'covered' });
      expect(await timeLoc()).toMatchObject({ source: 'setting', locationSetting: 'covered' });
      expect((await override())!.noLongerNeeded).toBeUndefined();
      // A value starting later is not in force yet.
      await inA((tx) => tx.setting.updateMany({ where: { organizationId: org.A.id, key: 'attendance.factories_act', scopeType: 'location', scopeId: ids.office }, data: { validFrom: new Date('2099-01-01T00:00:00Z') } }));
      expect((await orgLoc()).factoriesActSetting).toBeNull();
      await setFa(ids.office, 'covered');
      // HR ticks the flag: the value is shown as no longer needed; it is not removed by itself.
      await v1('adminA', 'put', `/org/locations/${ids.office}`).send(loc('Vapi office', O(), true)).expect(200);
      expect(await timeLoc()).toMatchObject({ source: 'registered_factory', locationSetting: 'covered' });
      expect((await override())!.noLongerNeeded).toBe('registered_factory');
      expect(await inA((tx) => tx.setting.count({ where: { organizationId: org.A.id, key: 'attendance.factories_act', scopeType: 'location', scopeId: ids.office } }))).toBe(1);
      // Removing the value afterwards changes nothing for the flagged location.
      await setFa(ids.office, '');
      expect(await timeLoc()).toMatchObject({ source: 'registered_factory', locationSetting: null });
      // Another company and a person without the key see none of it.
      expect(((await v1('hrB', 'get', '/org/locations').expect(200)).body as { id: string }[]).some((l) => l.id === ids.office)).toBe(false);
      await v1('staff', 'get', '/org/settings').expect(403);
      await v1('adminA', 'put', `/org/locations/${ids.office}`).send(loc('Vapi office', O(), false)).expect(200);
    });
  });
});
