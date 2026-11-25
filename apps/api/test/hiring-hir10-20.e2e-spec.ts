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
import { BGV_ITEMS, BGV_NOTICE } from '../src/lifecycle/portal.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HIR-10 BGV tracker (manual checks, founder decision 3), HIR-20 Talent CRM (pools, members with consent, postings) and
// HIR-07 scorecard comments (answer 322) end to end against the real database (forced RLS) and Redis:
//   BGV       the tracker lists joiners in the key's scope; results with who checked, the day and evidence (virus-scanned
//             after the commit); a discrepancy waits for a person, not the one who recorded it (company setting, default
//             on); "proceed" lets the joining gate pass; nothing is withdrawn; no key 403, another company 404, acting 403.
//   CRM       pools and hotlists with owner and consent counts; a talent pool takes only consented candidates; members
//             show their consent; postings list each job's boards.
//   Comments  only under a submitted scorecard, by whoever may read it, append-only (the table refuses edits), audited,
//             idempotent by requestId, redacted by the candidate erase; drafts refuse; acting 403; another company 404.
process.env.SD_SCANNER = 'dev-fake';

jest.setTimeout(240_000);

describe('Hiring HIR-10 / HIR-20 / HIR-07 comments', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'hr' | 'hr2' | 'recruiter' | 'int1' | 'int2' | 'hm' | 'emp' | 'adminB' | 'hrB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  type Check = { id: string; checkType: string; status: string; version: number; checkedBy: string | null; checkedOn: string | null; evidence: { version: number; scan: string } | null; decision: { decision: string; note: string; by: string } | null };
  type Row = { id: string; name: string; consent: string; checks: Check[] };
  const tracker = async (who: Who = 'hr') => (await api(who, 'get', '/lifecycle/bgv').expect(want(200))).body as { partner: null; deciderOtherPerson: boolean; joiners: Row[] };
  const check = async (id: string) => (await tracker()).joiners.flatMap((j) => j.checks).find((k) => k.id === id)!;
  const setting = (key: string, value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });

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

    planId = (await prisma.plan.create({ data: { name: `hir1020-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR1020 Org ${k}`, slug: `hir1020-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['hr', 'A', 'panel', [...tpl('hr_admin'), 'employee.change.manage']],
      ['hr2', 'A', 'panel', [...tpl('hr_admin'), 'employee.change.manage']],
      ['recruiter', 'A', 'panel', [...tpl('recruiter'), ...tpl('hiring_admin')]],
      ['int1', 'A', 'panel', ['ats.interview.schedule']],
      ['int2', 'A', 'panel', ['ats.interview.schedule']],
      ['hm', 'A', 'panel', ['ats.candidate.view']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
      ['hrB', 'B', 'panel', [...tpl('hr_admin'), 'employee.change.manage']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir1020-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir1020-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // The admin acting for HR: every key is there, so only the acting rule can refuse.
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.hr}`).expect(200)).body.accessToken;

    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods Pvt Ltd', shortName: `K${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'QA Engineer', code: 'QAE' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.notice = (await tx.consentNotice.create({ data: { ...o, purpose: 'talent_pool', version: 1, text: 'Keep my details for other roles.' } })).id;
    });
    await api('admin', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(want(201));
    const joiner = (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Ananya', familyName: run, email: `ananya-${run}@join.test`, joiningOn: today, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm }).expect(want(201))).body;
    ids.joiner = joiner.id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------------------------------ HIR-10 BGV tracker

  it('BGV tracker: consent pending first; checks need consent; only the BGV key sees it; never while acting', async () => {
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/ask`).expect(want(200));
    let t = await tracker();
    expect(t.partner).toBeNull();
    expect(t.deciderOtherPerson).toBe(true);
    expect(t.joiners).toEqual([expect.objectContaining({ id: ids.joiner, name: `Ananya ${run}`, consent: 'pending', checks: [] })]);
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/checks`).send({ checkType: 'employment', gate: 'before_joining' }).expect(409);
    // The joiner consents in the joining portal (lifecycle-6b covers that path); recorded here as the portal records it.
    const personId = (await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: ids.joiner } }))).personId;
    await inA((tx) => tx.consentRecord.create({ data: { organizationId: org.A.id, personId, purpose: 'bgv', noticeVersion: BGV_NOTICE, itemsShown: BGV_ITEMS as unknown as string[], evidence: { via: 'test' } } }));
    ids.employment = (await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/checks`).send({ checkType: 'employment', gate: 'before_joining' }).expect(want(201))).body.id;
    ids.education = (await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/checks`).send({ checkType: 'education', gate: 'none' }).expect(want(201))).body.id;
    await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/bgv/checks`).send({ checkType: 'horoscope', gate: 'none' }).expect(400);
    t = await tracker();
    expect(t.joiners[0]).toMatchObject({ consent: 'given' });
    expect(t.joiners[0].checks.map((k) => [k.checkType, k.status])).toEqual([['employment', 'requested'], ['education', 'requested']]);
    // No BGV key: a recruiter and hiring admin, an employee. Acting for HR: refused. Another company: sees none of it.
    await api('recruiter', 'get', '/lifecycle/bgv').expect(403);
    await api('emp', 'get', '/lifecycle/bgv').expect(403);
    await api('acting', 'get', '/lifecycle/bgv').expect(403);
    expect((await tracker('hrB')).joiners).toEqual([]);
    // Each look at the Special data is audited.
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'bgv.tracker.viewed', actorUserId: users.hr } }))).toBeGreaterThan(0);
  });

  it('BGV results: who checked, the day (not future), evidence virus-scanned after the commit; bad input 400', async () => {
    const result = (who: Who, id: string, status: string, version: number, extra: Record<string, string> = {}, file = true) => {
      let r = api(who, 'post', `/lifecycle/bgv/checks/${id}`).field('status', status).field('version', String(version));
      for (const [k, v] of Object.entries(extra)) r = r.field(k, v);
      return file ? r.attach('file', PNG, 'relieving-letter.png') : r;
    };
    await result('hr', ids.employment, 'maybe', 1).expect(400);
    await result('hr', ids.employment, 'discrepancy', 1, { checkedOn: '2099-01-01' }).expect(400);
    await result('hr', ids.employment, 'discrepancy', 1, { checkedOn: 'yesterday' }).expect(400);
    await result('hr', ids.employment, 'discrepancy', 1, { checkedOn: '2020-01-01' }).expect(400);
    await result('acting', ids.employment, 'discrepancy', 1).expect(403);
    await result('recruiter', ids.employment, 'discrepancy', 1).expect(403);
    await result('hrB', ids.employment, 'discrepancy', 1).expect(404);
    await result('hr', ids.employment, 'discrepancy', 1, { note: 'Dates at the previous employer differ by 4 months', checkedOn: today }).expect(want(200));
    // The same version again: someone else changed it meanwhile.
    await result('hr', ids.employment, 'clear', 1, {}, false).expect(409);
    const k = await check(ids.employment);
    expect(k).toMatchObject({ status: 'discrepancy', checkedBy: `hr ${run}`, checkedOn: today, decision: null, evidence: { version: 1, scan: 'clean' } });
    // The file was scanned after the commit (dev-fake scanner) and only then opens.
    const doc = await inA((tx) => tx.bgvCheck.findUniqueOrThrow({ where: { id: ids.employment } }));
    const file = await inA(async (tx) => tx.file.findUniqueOrThrow({ where: { id: (await tx.documentVersion.findFirstOrThrow({ where: { documentId: doc.resultDocumentId!, version: 1 } })).fileId } }));
    expect(file.scanStatus).toBe('clean');
    // A second check's evidence is its own version of the person's report.
    await result('hr', ids.education, 'clear', 1, { note: 'Degree confirmed by the university' }).expect(want(200));
    expect((await check(ids.education)).evidence).toMatchObject({ version: 2, scan: 'clean' });
    expect((await check(ids.employment)).evidence).toMatchObject({ version: 1 });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'bgv.check.updated', entityId: ids.joiner } }))).toBe(2);
  });

  it('a discrepancy goes to a person: not who recorded it (setting), with a reason; never automatic; then joining may pass', async () => {
    const decide = (who: Who, id: string, body: Record<string, unknown>) => api(who, 'post', `/lifecycle/bgv/checks/${id}/decision`).send(body);
    const v = (await check(ids.employment)).version;
    // Nothing was withdrawn: the joiner is still waiting to join, and joining is blocked by the gate until decided.
    expect((await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: ids.joiner } }))).status).toBe('invited');
    await decide('hr', ids.employment, { decision: 'proceed', note: 'Explained by a career break', version: v }).expect(403);
    await decide('hr2', ids.employment, { decision: 'proceed', version: v }).expect(400);
    await decide('hr2', ids.employment, { decision: 'withdraw', note: 'No', version: v }).expect(400);
    await decide('hr2', ids.employment, { decision: 'proceed', note: 'ok', version: v, extra: 1 }).expect(400);
    await decide('acting', ids.employment, { decision: 'proceed', note: 'Explained by a career break', version: v }).expect(403);
    await decide('recruiter', ids.employment, { decision: 'proceed', note: 'Explained by a career break', version: v }).expect(403);
    await decide('hrB', ids.employment, { decision: 'proceed', note: 'Explained by a career break', version: v }).expect(404);
    await decide('hr2', ids.education, { decision: 'proceed', note: 'Nothing to decide here', version: (await check(ids.education)).version }).expect(409);
    await decide('hr2', ids.employment, { decision: 'proceed', note: 'Explained by a career break', version: v + 5 }).expect(409);
    await decide('hr2', ids.employment, { decision: 'proceed', note: 'Explained by a career break', version: v }).expect(want(200));
    await decide('hr', ids.employment, { decision: 'stop', note: 'Second opinion', version: v + 1 }).expect(409);
    expect((await check(ids.employment)).decision).toMatchObject({ decision: 'proceed', note: 'Explained by a career break', by: `hr2 ${run}` });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'bgv.discrepancy.decided', entityId: ids.joiner } }))).toBe(1);
    // "Proceed" lets the before-joining gate pass: joining now fails only for its own reasons, never the BGV gate.
    const pb = await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: ids.joiner } }));
    const join = await api('hr', 'post', `/lifecycle/joiners/${ids.joiner}/join`).send({ identityAttested: true, status: 'probation', version: pb.version });
    expect(String(join.body.message ?? '')).not.toMatch(/background check/i);
  });

  it('with the setting off the same HR person may decide; a new result sends it back for a decision', async () => {
    await setting('hiring.bgv.decider_other_person', 'off');
    const k = await check(ids.education);
    await api('hr', 'post', `/lifecycle/bgv/checks/${ids.education}`).field('status', 'discrepancy').field('note', 'Year of passing differs').field('version', String(k.version)).expect(want(200));
    expect((await tracker()).deciderOtherPerson).toBe(false);
    await api('hr', 'post', `/lifecycle/bgv/checks/${ids.education}/decision`).send({ decision: 'stop', note: 'Do not continue until the candidate explains', version: k.version + 1 }).expect(want(200));
    expect((await check(ids.education)).decision).toMatchObject({ decision: 'stop' });
    // "Stop" only records the decision: the joiner is not cancelled automatically.
    expect(['invited', 'joined']).toContain((await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: ids.joiner } }))).status);
    const k2 = await check(ids.education);
    await api('hr', 'post', `/lifecycle/bgv/checks/${ids.education}`).field('status', 'clear').field('version', String(k2.version)).expect(want(200));
    expect((await check(ids.education)).decision).toBeNull();
    await setting('hiring.bgv.decider_other_person', 'on');
  });

  it('answer 364: a "before confirmation" check blocks joining as confirmed (409 with a code), not joining on probation; clear passes', async () => {
    const j = (await api('hr', 'post', '/lifecycle/joiners').send({ givenName: 'Rohan', familyName: run, email: `rohan-${run}@join.test`, joiningOn: today, legalEntityId: ids.entity, locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm }).expect(want(201))).body;
    await api('hr', 'post', `/lifecycle/joiners/${j.id}/bgv/ask`).expect(want(200));
    const personId = (await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: j.id } }))).personId;
    await inA((tx) => tx.consentRecord.create({ data: { organizationId: org.A.id, personId, purpose: 'bgv', noticeVersion: BGV_NOTICE, itemsShown: BGV_ITEMS as unknown as string[], evidence: { via: 'test' } } }));
    const k = (await api('hr', 'post', `/lifecycle/joiners/${j.id}/bgv/checks`).send({ checkType: 'criminal', gate: 'before_confirmation' }).expect(want(201))).body.id as string;
    const version = async () => (await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: j.id } }))).version;
    const refused = await api('hr', 'post', `/lifecycle/joiners/${j.id}/join`).send({ identityAttested: true, status: 'confirmed', version: await version() }).expect(409);
    expect(refused.body).toMatchObject({ code: 'BGV_NOT_CLEAR_FOR_CONFIRMATION', message: expect.stringMatching(/must be clear before confirmation/) });
    expect((await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: j.id } }))).status).toBe('invited');
    // Joining on probation is not held by a before-confirmation check.
    const onProbation = await api('hr', 'post', `/lifecycle/joiners/${j.id}/join`).send({ identityAttested: true, status: 'probation', version: await version() });
    expect(onProbation.body.code).not.toBe('BGV_NOT_CLEAR_FOR_CONFIRMATION');
    expect(String(onProbation.body.message ?? '')).not.toMatch(/background check/i);
    // The confirmation later waits on the same check (the gate follows the joining into the employment).
    const pb = await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: j.id } }));
    if (pb.employmentId) {
      const { openConfirmationChecks } = await import('../src/lifecycle/bgv-gate');
      expect(await inA((tx) => openConfirmationChecks(tx as never, org.A.id, pb.employmentId!))).toBe(1);
      const kv = (await check(k)).version;
      await api('hr', 'post', `/lifecycle/bgv/checks/${k}`).field('status', 'clear').field('version', String(kv)).expect(want(200));
      expect(await inA((tx) => openConfirmationChecks(tx as never, org.A.id, pb.employmentId!))).toBe(0);
    }
  });

  // ------------------------------------------------------------------------------------------ HIR-20 Talent CRM

  it('pools: create (bad input 400), consent counts and owner; a talent pool takes only consented people; remove', async () => {
    const cand = (name: string, consent: 'given' | 'withdrawn' | null) =>
      inA(async (tx) => {
        const x = { organizationId: org.A.id };
        const c = await tx.candidate.create({ data: { ...x, name: `${name} ${run}`, email: `${name.toLowerCase()}-${run}@cand.test` } });
        if (consent) await tx.candidateConsent.create({ data: { ...x, candidateId: c.id, noticeId: ids.notice, purpose: 'talent_pool', version: 1, source: 'apply', ...(consent === 'withdrawn' ? { withdrawnAt: new Date() } : {}) } });
        return c.id;
      });
    ids.kept = await cand('Kept', 'given');
    ids.gone = await cand('Gone', 'withdrawn');
    ids.never = await cand('Never', null);
    await api('recruiter', 'post', '/hiring/pools').send({ name: '', kind: 'pool' }).expect(400);
    await api('recruiter', 'post', '/hiring/pools').send({ name: 'QA silver medallists', kind: 'shortlist' }).expect(400);
    await api('acting', 'post', '/hiring/pools').send({ name: 'Acting pool', kind: 'pool' }).expect(403);
    await api('emp', 'post', '/hiring/pools').send({ name: 'Mine', kind: 'pool' }).expect(403);
    ids.pool = (await api('recruiter', 'post', '/hiring/pools').send({ name: 'QA silver medallists', kind: 'pool', description: 'Strong finalists' }).expect(want(201))).body.id;
    ids.hot = (await api('recruiter', 'post', '/hiring/pools').send({ name: 'Plant supervisors', kind: 'hotlist' }).expect(want(201))).body.id;
    // A talent pool: only the consented one joins; the others are reported, nobody is silently added.
    expect((await api('recruiter', 'post', `/hiring/pools/${ids.pool}/members`).send({ candidateIds: [ids.kept, ids.gone, ids.never] }).expect(want(200))).body).toEqual({ added: 1, refused: [ids.gone, ids.never] });
    await api('recruiter', 'post', `/hiring/pools/${ids.pool}/members`).send({ candidateIds: [ids.never] }).expect(409);
    await api('recruiter', 'post', `/hiring/pools/${ids.pool}/members`).send({ candidateIds: ['nope'] }).expect(400);
    await api('acting', 'post', `/hiring/pools/${ids.pool}/members`).send({ candidateIds: [ids.kept] }).expect(403);
    // A hotlist needs no consent.
    expect((await api('recruiter', 'post', `/hiring/pools/${ids.hot}/members`).send({ candidateIds: [ids.kept, ids.never] }).expect(want(200))).body.added).toBe(2);
    const lists = (await api('hm', 'get', '/hiring/pools').expect(want(200))).body as { id: string; members: number; consented: number; ownerName: string; updatedAt: string }[];
    expect(lists.find((l) => l.id === ids.pool)).toMatchObject({ members: 1, consented: 1, ownerName: `recruiter ${run}` });
    expect(lists.find((l) => l.id === ids.hot)).toMatchObject({ members: 2, consented: 1 });
    const members = (await api('recruiter', 'get', `/hiring/pools/${ids.hot}/members`).expect(want(200))).body.members as { candidateId: string; consent: string }[];
    expect(Object.fromEntries(members.map((m) => [m.candidateId, m.consent]))).toEqual({ [ids.kept]: 'given', [ids.never]: 'none' });
    await api('emp', 'get', '/hiring/pools').expect(403);
    expect((await api('adminB', 'get', '/hiring/pools').expect(200)).body).toEqual([]);
    await api('adminB', 'get', `/hiring/pools/${ids.pool}/members`).expect(404);
    await api('acting', 'delete', `/hiring/pools/${ids.hot}/members/${ids.never}`).expect(403);
    await api('recruiter', 'delete', `/hiring/pools/${ids.hot}/members/${ids.never}`).expect(want(200));
    await api('acting', 'delete', `/hiring/pools/${ids.hot}`).expect(403);
    await api('recruiter', 'delete', `/hiring/pools/${ids.hot}`).expect(want(200));
    await api('recruiter', 'delete', `/hiring/pools/${ids.hot}`).expect(404);
    expect((await api('recruiter', 'get', '/hiring/pools').expect(200)).body.map((l: { id: string }) => l.id)).toEqual([ids.pool]);
  });

  it('postings: every open job with its board postings; read keys only; another company sees none', async () => {
    ids.job = (await api('recruiter', 'post', '/jobs').send({ title: 'Senior QA Engineer' }).expect(want(201))).body.id;
    await inA((tx) => tx.jobBoard.create({ data: { organizationId: org.A.id, name: 'Naukri', feedToken: `feed-${run}` } }));
    const rows = (await api('recruiter', 'get', '/hiring/postings').expect(want(200))).body as { jobId: string; title: string; postings: { board: string; status: string }[] }[];
    expect(rows.find((r) => r.jobId === ids.job)).toMatchObject({ title: 'Senior QA Engineer', postings: [expect.objectContaining({ board: 'Naukri', status: 'not posted' })] });
    await api('emp', 'get', '/hiring/postings').expect(403);
    expect((await api('adminB', 'get', '/hiring/postings').expect(200)).body).toEqual([]);
  });

  // ------------------------------------------------------------------------------------------ HIR-07 comments (answer 322)

  it('scorecard comments: never on a draft; append-only, audited, idempotent; whoever may read it; acting 403; other company 404', async () => {
    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'QA round 1', scaleMax: 5, passBar: 3, items: [{ label: 'Test design', weight: 100 }] }).expect(want(201))).body;
    await api('recruiter', 'put', `/hiring/jobs/${ids.job}/scorecard`).send({ templateId: t.id }).expect(want(200));
    await inA((tx) => tx.job.update({ where: { id: ids.job }, data: { hiringManagerId: users.hm } }));
    const entry = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name: 'Vikram Reddy', email: `vikram-${run}@x.test` } }).expect(201)).body.id;
    const at = new Date(Date.now() - 3 * 3_600_000);
    ids.iv = (await api('recruiter', 'post', `/pipeline/entries/${entry}/interviews`).send({ panelistUserIds: [users.int1, users.int2], location: 'Video call', timeZone: 'Asia/Kolkata', slots: [{ startsAt: at.toISOString(), endsAt: new Date(at.getTime() + 3_600_000).toISOString() }] }).expect(want(201))).body.id;
    const path = (sc: string) => `/hiring/interviews/${ids.iv}/scorecards/${sc}/comments`;
    await api('int1', 'put', `/hiring/interviews/${ids.iv}/scorecard`).send({ ratings: [{ itemId: t.items[0].id, rating: 4 }] }).expect(want(200));
    const draft = (await api('int1', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body.scorecards[0];
    await api('int1', 'post', path(draft.id)).send({ body: 'Too early' }).expect(409);
    // Not readable by the recruiter yet (a draft): 404, never a hint it exists.
    await api('recruiter', 'post', path(draft.id)).send({ body: 'Seen?' }).expect(404);
    await api('int1', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: t.items[0].id, rating: 4, notes: 'Vikram named every boundary case' }], recommendation: 'yes', summary: 'Strong tester; hire Vikram' }).expect(want(200));
    const sc = draft.id as string;
    await api('int1', 'post', path(sc)).send({ body: '   ' }).expect(400);
    await api('int1', 'post', path(sc)).send({ body: 'x'.repeat(2001) }).expect(400);
    await api('int1', 'post', path(sc)).send({ body: 'ok', requestId: 'not-a-uuid' }).expect(400);
    await api('int1', 'post', `/hiring/interviews/${ids.iv}/scorecards/not-a-uuid/comments`).send({ body: 'ok' }).expect(400);
    const requestId = randomUUID();
    const first = (await api('int1', 'post', path(sc)).send({ body: 'I forgot: she also named the boundary cases.', requestId }).expect(want(201))).body;
    expect(first).toMatchObject({ author: `int1 ${run}`, body: 'I forgot: she also named the boundary cases.', redacted: false });
    // A retry with the same key returns the same comment.
    expect((await api('int1', 'post', path(sc)).send({ body: 'I forgot: she also named the boundary cases.', requestId }).expect(want(201))).body.id).toBe(first.id);
    // The recruiter and the hiring manager read the scorecard, so they may comment; the other panellist only after submitting.
    await api('recruiter', 'post', path(sc)).send({ body: 'Thanks, noted for the debrief.' }).expect(want(201));
    await api('int2', 'post', path(sc)).send({ body: 'Before submitting mine' }).expect(404);
    await api('hm', 'post', path(sc)).send({ body: 'Agree with the panel.' }).expect(want(201));
    await api('acting', 'post', path(sc)).send({ body: 'As HR' }).expect(403);
    await api('emp', 'post', path(sc)).send({ body: 'Hi' }).expect(403);
    await api('adminB', 'post', path(sc)).send({ body: 'Hi' }).expect(404);
    const seen = (who: Who) => api(who, 'get', `/hiring/interviews/${ids.iv}`).expect(200).then((r) => (r.body.scorecards as { id: string; comments: { body: string }[] }[]).find((x) => x.id === sc)?.comments.map((m) => m.body));
    const all = ['I forgot: she also named the boundary cases.', 'Thanks, noted for the debrief.', 'Agree with the panel.'];
    expect(await seen('int1')).toEqual(all);
    expect(await seen('hm')).toEqual(all);
    expect(await seen('int2')).toBeUndefined();
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.scorecard.commented', entityId: sc } }))).toBe(3);
    // Append-only in the database itself: an edit is refused; only the erase redaction is allowed.
    await expect(inA((tx) => tx.scorecardComment.update({ where: { id: first.id }, data: { body: 'changed' } }))).rejects.toThrow(/append-only/);
    const candidateId = (await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: entry } }))).candidateId;
    await inA((tx) => tx.pipelineEntry.update({ where: { id: entry }, data: { rejected: true } }));
    await api('admin', 'post', `/candidates/${candidateId}/erase`).expect((r) => expect([200, 201]).toContain(r.status));
    expect(await seen('int1')).toEqual(['Redacted', 'Redacted', 'Redacted']);
    // Answer 367: the scorecard's own summary and rating notes are redacted too; the rating, recommendation and score stay.
    const card = await inA((tx) => tx.scorecard.findUniqueOrThrow({ where: { id: sc }, include: { ratings: true } }));
    expect(card).toMatchObject({ summary: 'Redacted', recommendation: 'yes', status: 'submitted', redactedAt: expect.any(Date) });
    expect(card.ratings).toEqual([expect.objectContaining({ rating: 4, notes: 'Redacted' })]);
    const view = (await api('int1', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body.scorecards.find((x: { id: string }) => x.id === sc);
    expect(JSON.stringify(view)).not.toMatch(/Vikram named|hire Vikram/);
    // Still frozen for everything else: no new text, no new rating, no second redaction, no deleting a rating.
    await expect(inA((tx) => tx.scorecard.update({ where: { id: sc }, data: { summary: 'Rewritten' } }))).rejects.toThrow(/cannot be changed/);
    await expect(inA((tx) => tx.scorecard.update({ where: { id: sc }, data: { recommendation: 'no' } }))).rejects.toThrow(/cannot be changed/);
    await expect(inA((tx) => tx.scorecardRating.updateMany({ where: { scorecardId: sc }, data: { rating: 1 } }))).rejects.toThrow(/cannot be changed/);
    await expect(inA((tx) => tx.scorecardRating.updateMany({ where: { scorecardId: sc }, data: { notes: 'New words' } }))).rejects.toThrow(/cannot be changed/);
    await expect(inA((tx) => tx.scorecardRating.deleteMany({ where: { scorecardId: sc } }))).rejects.toThrow(/cannot be changed/);
    // Erasing again is a no-op for the scorecards.
    await api('admin', 'post', `/candidates/${candidateId}/erase`).expect((r) => expect([200, 201]).toContain(r.status));
  });
});
