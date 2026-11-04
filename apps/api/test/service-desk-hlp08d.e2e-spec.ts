process.env.SD_SCANNER = 'dev-fake';
process.env.LETTER_PDF_CONVERTER = 'dev-fake';
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
import { markSteppedUp } from './fixtures/step-up';

// HLP-08 disciplinary show-cause cases (founder answer 34) end to end against the real database (forced RLS, the app
// role). Positive and negative: only HR with case.disciplinary.raise opens one, and only about people in their HR scope
// (never a manager alone, never oneself); only the HR members and the employee see it (the manager, other HR, the System
// Admin and another company get Not found); reply days from the legal entity's setting or the standing orders rule set;
// the employee replies and asks for more time once in My cases; no decision before the reply or its date; two people
// decide (dropped, warning or an inquiry, which is recorded and keeps the case open); suspension is only an HR task;
// nothing changes in People or Pay; bad input; acting for someone else is refused.
describe('HLP-08 disciplinary show-cause cases', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr1' | 'hr2' | 'hrE2' | 'hrB' | 'mgr' | 'emp' | 'other';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const emp: Record<string, string> = {};
  const call = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1/desk${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const detail = async (who: Who, id: string) => (await call(who, 'get', `/cases/${id}`).expect(200)).body;
  const RAISE = { misconduct: 'Absence without leave for more than 4 days', facts: 'Absent from work for five working days without applying for leave or telling the supervisor.', rule: 'Standing orders clause 14(2)(c)' };

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

    planId = (await prisma.plan.create({ data: { name: `hlp08d-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HLP08D Org ${k}`, slug: `hlp08d-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr1', 'A', 'panel', tpl('hr_admin')],
      ['hr2', 'A', 'panel', tpl('hr_admin')],
      // HR Admin keys for the second legal entity only (the template's typical scope).
      ['hrE2', 'A', 'panel', null],
      ['hrB', 'B', 'panel', tpl('hr_admin')],
      ['mgr', 'A', 'panel', []],
      ['emp', 'A', 'panel', []],
      ['other', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hlp08d-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hlp08d-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.e1 = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.e2 = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Retail Pvt Ltd', shortName: `KR${run.slice(0, 4).toUpperCase()}`, isDefault: false, pan: 'AAPFU0940G' } })).id;
      ids.l1 = (await tx.location.create({ data: { ...x, legalEntityId: ids.e1, name: 'Hosur', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      ids.l2 = (await tx.location.create({ data: { ...x, legalEntityId: ids.e2, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const d = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: d, name: 'Packing', code: 'PCK', path: `/${d}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      const role = await tx.permissionProfile.create({ data: { ...x, name: `hr-e2-${run}`, permissionsJson: JSON.stringify(tpl('hr_admin')) } });
      await tx.roleGrant.create({ data: { ...x, userId: users.hrE2, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.e2, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Retail HR' } });
      // The first entity's certified standing orders give 10 days to reply.
      await tx.setting.create({ data: { ...x, scopeType: 'legal_entity', scopeId: ids.e1, key: 'cases.disciplinary.reply_days', value: '10' } });
    });
    const hire = async (who: Who, code: string, entity: string, loc: string, managerEmployeeId: string | null) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: 'Kumar', employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@hlp08d-${run}.test`, assignment: { locationId: loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId } }).expect(201)).body.id as string;
    emp.mgr = await hire('mgr', 'KF-001', ids.e1, ids.l1, null);
    emp.emp = await hire('emp', 'KF-002', ids.e1, ids.l1, emp.mgr);
    emp.other = await hire('other', 'KR-001', ids.e2, ids.l2, null);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('only HR with the key opens one, only about people in their HR scope; never a manager, never oneself; bad input refused', async () => {
    for (const who of ['mgr', 'emp', 'other'] as Who[]) await call(who, 'post', '/cases/disciplinary').send({ employeeUserId: users.emp, ...RAISE }).expect(403);
    await call('mgr', 'get', '/cases/disciplinary/people').expect(403);
    const people = (await call('hr1', 'get', '/cases/disciplinary/people').expect(200)).body.people.map((p: { id: string }) => p.id);
    expect(people).toEqual(expect.arrayContaining([users.emp, users.mgr, users.other]));
    expect(people).not.toContain(users.hr1);
    const scoped = (await call('hrE2', 'get', '/cases/disciplinary/people').expect(200)).body.people.map((p: { id: string }) => p.id);
    expect(scoped).toEqual([users.other]);
    expect((await call('hrE2', 'post', '/cases/disciplinary').send({ employeeUserId: users.emp, ...RAISE }).expect(403)).body.code).toBe('CASE_OUT_OF_SCOPE');
    await call('hr1', 'post', '/cases/disciplinary').send({ employeeUserId: users.hr1, ...RAISE }).expect(400);
    await call('hr1', 'post', '/cases/disciplinary').send({ employeeUserId: users.adminA, ...RAISE }).expect(400); // no employee record
    await call('hr1', 'post', '/cases/disciplinary').send({ employeeUserId: users.emp, misconduct: 'x', facts: RAISE.facts }).expect(400);
    await call('hr1', 'post', '/cases/disciplinary').send({ employeeUserId: users.emp, ...RAISE, penalty: 'dismiss' }).expect(400);
    await call('hrB', 'post', '/cases/disciplinary').send({ employeeUserId: users.emp, ...RAISE }).expect(400); // another company's person
    const r = (await call('hr1', 'post', '/cases/disciplinary').send({ employeeUserId: users.emp, ...RAISE }).expect(201)).body;
    expect(r.ref).toBe('DSC-0001');
    ids.c = r.id;
    ids.c2 = (await call('hrE2', 'post', '/cases/disciplinary').send({ employeeUserId: users.other, ...RAISE }).expect(201)).body.id;
  });

  it('only its HR members and (after the notice) the employee see it; the manager, other HR, the System Admin and another company get Not found', async () => {
    const d = await detail('hr1', ids.c);
    expect(d).toMatchObject({ kind: 'disciplinary', ref: 'DSC-0001', stage: 'Opened', respondent: `emp ${run}`, rule: 'Standing orders clause 14(2)(c)', report: { category: RAISE.misconduct }, members: [expect.objectContaining({ id: users.hr1, role: 'HR (disciplinary)' })] });
    for (const who of ['mgr', 'hr2', 'adminA', 'emp', 'other', 'adminB'] as Who[]) await call(who, 'get', `/cases/${ids.c}`).expect(404);
    expect((await call('emp', 'get', '/my/cases').expect(200)).body).toEqual([]);
    expect((await call('hr1', 'get', '/my/cases').expect(200)).body).toEqual([]); // the opener is HR, not a reporter
    expect((await call('hr1', 'get', '/cases').expect(200)).body).toEqual([expect.objectContaining({ id: ids.c, kind: 'disciplinary' })]);
    await call('hr1', 'post', `/cases/${ids.c}/messages`).send({ body: 'Hello there' }).expect(400);
    // The menu shows Cases to HR who may open one, not to the manager.
    const counts = async (who: Who) => (await request(server()).get('/api/v1/workspace/counts').set('Authorization', `Bearer ${token[who]}`).expect(200)).body;
    expect((await counts('hr2')).casesOpen).toBe(0);
    expect((await counts('mgr')).casesOpen).toBeUndefined();
  });

  it('a second HR person joins; the manager joins only with a recorded override', async () => {
    const d = await detail('hr1', ids.c);
    await call('hr1', 'post', `/cases/${ids.c}/members`).send({ personId: users.hr2, role: 'officer' }).expect(201);
    expect((await call('hr1', 'post', `/cases/${ids.c}/members`).send({ personId: users.mgr, role: 'investigator' }).expect(409)).body.code).toBe('CASE_CONFLICT');
    expect(d.version).toBeGreaterThan(0);
    expect((await detail('hr2', ids.c)).members.map((m: { id: string }) => m.id).sort()).toEqual([users.hr1, users.hr2].sort());
    await call('mgr', 'get', `/cases/${ids.c}`).expect(404);
  });

  it('the show-cause notice: reply days from the legal entity setting, else the standing orders rule set; no decision before the reply', async () => {
    let d = await detail('hr1', ids.c);
    expect((await call('hr1', 'post', `/cases/${ids.c}/outcome`).send({ decision: 'warning', action: 'Written warning', reasons: 'Absent five days without leave or notice.', reporterSummary: 'A written warning.', version: d.version }).expect(409)).body.code).toBe('CASE_TOO_EARLY');
    const r = (await call('hr1', 'post', `/cases/${ids.c}/notice`).send({ allegations: `${RAISE.misconduct}. ${RAISE.facts}` }).expect(201)).body;
    expect(r.replyBy).toBe(shift(10));
    d = await detail('hr1', ids.c);
    expect(d).toMatchObject({ stage: 'Show-cause notice', notice: { status: 'sent', replySource: expect.stringContaining('') } });
    const r2 = (await call('hrE2', 'post', `/cases/${ids.c2}/notice`).send({ allegations: `${RAISE.misconduct}. ${RAISE.facts}` }).expect(201)).body;
    expect(r2.replyBy).toBe(shift(7));
    const mine = (await call('other', 'get', `/my/cases/${ids.c2}`).expect(200)).body;
    expect(mine).toMatchObject({ kind: 'disciplinary', role: 'respondent', notice: { replySource: 'IN.SO.MODEL 1946-v1 (verify): 7 days', rule: 'Standing orders clause 14(2)(c)' } });
    d = await detail('hr1', ids.c);
    expect((await call('hr1', 'post', `/cases/${ids.c}/outcome`).send({ decision: 'warning', action: 'Written warning', reasons: 'Absent five days without leave or notice.', reporterSummary: 'A written warning.', version: d.version }).expect(409)).body.code).toBe('CASE_TOO_EARLY');
  });

  it('the employee sees the notice in My cases, asks for more time once and replies with a file', async () => {
    expect((await call('emp', 'get', '/my/cases').expect(200)).body).toEqual([expect.objectContaining({ id: ids.c, kind: 'disciplinary', role: 'respondent', stage: 'Show-cause notice', status: 'action', next: { label: 'Your reply due', on: shift(10) } })]);
    const mine = (await call('emp', 'get', `/my/cases/${ids.c}`).expect(200)).body;
    expect(mine.notice).toMatchObject({ rule: 'Standing orders clause 14(2)(c)', replyBy: shift(10), replySource: 'Standing orders setting for the legal entity: 10 days to reply' });
    expect(JSON.stringify(mine)).not.toContain(`hr1 ${run}`);
    await call('emp', 'post', `/my/cases/${ids.c}/more-time`).send({ reason: 'I am in hospital this week.' }).expect(201);
    await call('emp', 'post', `/my/cases/${ids.c}/more-time`).send({ reason: 'Again please.' }).expect(409);
    await call('mgr', 'post', `/my/cases/${ids.c}/reply`).send({ text: 'Replying for him.' }).expect(404);
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const f = (await call('emp', 'post', `/my/cases/${ids.c}/files`).attach('file', pdf, 'discharge-summary.pdf').expect(201)).body;
    await call('emp', 'post', `/my/cases/${ids.c}/reply`).send({ text: 'I was in hospital in my village from 8 to 11 Sep.', fileIds: [f.id] }).expect(201);
    expect((await detail('hr2', ids.c))).toMatchObject({ stage: 'Reply', canDecide: { ok: true }, notice: { replies: [expect.objectContaining({ files: [expect.objectContaining({ name: 'discharge-summary.pdf' })] })] } });
  });

  it('suspension is only an HR task; nothing changes in People or Pay', async () => {
    const before = await inA((tx) => tx.employeeAssignment.findMany({ where: { employeeId: emp.emp }, orderBy: { recordedAt: 'asc' } }));
    const empBefore = await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.emp } }));
    const r = (await call('hr1', 'post', `/cases/${ids.c}/relief`).send({ action: 'suspension', note: 'Suspend pending inquiry if it is ordered; subsistence allowance through payroll.', assigneeUserId: users.hr2 }).expect(201)).body;
    expect(r.taskRef).toBe('DSC-0001-R1');
    await call('hr1', 'post', `/cases/${ids.c}/relief`).send({ action: 'suspension', note: 'Not the employee.', assigneeUserId: users.emp }).expect(400);
    expect(await inA((tx) => tx.employeeAssignment.findMany({ where: { employeeId: emp.emp }, orderBy: { recordedAt: 'asc' } }))).toEqual(before);
    expect(await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.emp } }))).toEqual(empBefore);
  });

  it('two people decide: the one who proposes never approves; decisions are dropped, warning or inquiry only', async () => {
    let d = await detail('hr1', ids.c);
    await call('hr1', 'post', `/cases/${ids.c}/outcome`).send({ decision: 'dismissal', action: 'x x x', reasons: 'Absent five days without leave or notice.', reporterSummary: 'x x x', version: d.version }).expect(400);
    await call('hr1', 'post', `/cases/${ids.c}/outcome`).send({ finding: 'proved', action: 'Written warning', reasons: 'Absent five days without leave or notice.', reporterSummary: 'x x x', version: d.version }).expect(400);
    await call('hr1', 'post', `/cases/${ids.c}/outcome`).send({ decision: 'warning', action: 'Written warning, valid 12 months', reasons: 'Absent five days; the hospital stay covers four of them.', reporterSummary: 'You get a written warning for one day of absence without leave.', version: d.version }).expect(201);
    d = await detail('hr1', ids.c);
    expect(d).toMatchObject({ stage: 'Decision proposed', outcome: { status: 'proposed', decision: 'warning', proposedByMe: true } });
    expect((await call('hr1', 'post', `/cases/${ids.c}/outcome/approve`).send({ version: d.version }).expect(403)).body.code).toBe('CASE_FOUR_EYES');
    await call('hr2', 'post', `/cases/${ids.c}/outcome/approve`).send({ version: d.version }).expect(201);
    expect(await detail('hr1', ids.c)).toMatchObject({ status: 'closed', stage: 'Decided', outcome: { status: 'approved', decision: 'warning', approvedBy: `hr2 ${run}` } });
    expect((await call('emp', 'get', `/my/cases/${ids.c}`).expect(200)).body).toMatchObject({ status: 'closed', outcome: 'You get a written warning for one day of absence without leave.' });
    const steps = await inA((tx) => tx.speakupCaseStep.findMany({ where: { caseId: ids.c, kind: { in: ['proposed', 'approved'] } } }));
    expect(steps.map((s) => (s.data as { decision?: string }).decision)).toEqual(['warning', 'warning']);
  });

  it('an inquiry is recorded only: the case stays open at "Inquiry ordered"', async () => {
    await call('other', 'post', `/my/cases/${ids.c2}/reply`).send({ text: 'I deny it.' }).expect(201);
    await call('hrE2', 'post', `/cases/${ids.c2}/members`).send({ personId: users.hr1, role: 'officer' }).expect(201);
    let d = await detail('hrE2', ids.c2);
    await call('hrE2', 'post', `/cases/${ids.c2}/outcome`).send({ decision: 'inquiry', action: 'Domestic inquiry by an inquiry officer', reasons: 'The employee denies it; the attendance record needs testing.', reporterSummary: 'The company will hold a domestic inquiry.', version: d.version }).expect(201);
    d = await detail('hr1', ids.c2);
    await call('hr1', 'post', `/cases/${ids.c2}/outcome/approve`).send({ version: d.version }).expect(201);
    d = await detail('hr1', ids.c2);
    expect(d).toMatchObject({ status: 'open', stage: 'Inquiry ordered', outcome: { decision: 'inquiry', status: 'approved' } });
    expect((await call('other', 'get', '/my/cases').expect(200)).body).toEqual([expect.objectContaining({ stage: 'Inquiry ordered', status: 'open' })]);
  });

  it('the warning letter (answer 56): waits for the company template, then goes out through Letters once; never for an inquiry', async () => {
    let d = await detail('hr1', ids.c);
    expect(d.letter).toMatchObject({ id: null, status: 'waiting' });
    expect((await call('hr1', 'post', `/cases/${ids.c}/letter`).expect(400)).body.message).toMatch(/no active warning template/);
    await call('mgr', 'post', `/cases/${ids.c}/letter`).expect(404);
    await call('hr1', 'post', `/cases/${ids.c2}/letter`).expect(400);
    // The company switches on its warning letter template from the YukthiX starter, and names who signs.
    const api = (method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token.adminA}`);
    const t = (await api('post', '/letters/templates/starter').send({ letterType: 'warning' }).expect(201)).body;
    expect(t.fields).toEqual(expect.arrayContaining(['case_reference', 'misconduct', 'decision_summary', 'decision_date']));
    await api('get', `/letters/templates/${t.id}/preview`).expect(200);
    await api('post', `/letters/templates/${t.id}/activate`).expect(200);
    await markSteppedUp(tenantPrisma, token.adminA);
    await api('post', '/letters/signatories').field('legalEntityId', ids.e1).field('userId', users.adminA).field('title', 'Head of People').expect(201);
    const r = (await call('hr2', 'post', `/cases/${ids.c}/letter`).expect(201)).body;
    expect(r.letterId).toEqual(expect.any(String));
    await call('hr1', 'post', `/cases/${ids.c}/letter`).expect(409);
    const l = await inA((tx) => tx.letterIssue.findFirstOrThrow({ where: { id: r.letterId } }));
    expect(l).toMatchObject({ letterType: 'warning', subjectType: 'speakup_case', subjectId: ids.c, templateId: t.id });
    d = await detail('hr1', ids.c);
    expect(d.letter.id).toBe(r.letterId);
    expect(d.timeline.map((x: { text: string }) => x.text)).toContain('Issued the warning letter (Letters)');
    // The employee finds it with their letters.
    const mine = (await request(server()).get('/api/v1/letters/me').set('Authorization', `Bearer ${token.emp}`).expect(200)).body;
    expect(JSON.stringify(mine)).toContain(r.letterId);
  });

  it('a manager reports misconduct by their own report only; it reaches HR in scope as a draft nobody else sees', async () => {
    expect((await call('mgr', 'get', '/my/misconduct-reports/people').expect(200)).body.people.map((p: { id: string }) => p.id)).toEqual([users.emp]);
    expect((await call('emp', 'get', '/my/misconduct-reports/people').expect(200)).body.people).toEqual([]);
    const R = { employeeUserId: users.emp, misconduct: 'Rude to a customer at the counter', facts: 'Shouted at a customer on 2 Nov at the Hosur counter; two colleagues saw it.' };
    expect((await call('mgr', 'post', '/my/misconduct-reports').send({ ...R, employeeUserId: users.other }).expect(403)).body.code).toBe('CASE_NOT_YOUR_REPORT');
    expect((await call('emp', 'post', '/my/misconduct-reports').send({ ...R, employeeUserId: users.mgr }).expect(403)).body.code).toBe('CASE_NOT_YOUR_REPORT');
    await call('mgr', 'post', '/my/misconduct-reports').send({ ...R, facts: 'short' }).expect(400);
    await call('mgr', 'post', '/my/misconduct-reports').send({ ...R, happenedOn: shift(3) }).expect(400);
    const counts = async (who: Who) => (await request(server()).get('/api/v1/workspace/counts').set('Authorization', `Bearer ${token[who]}`).expect(200)).body as Record<string, number>;
    const before = (await counts('hr1')).casesOpen ?? 0;
    const beforeE2 = (await counts('hrE2')).casesOpen ?? 0;
    ids.r1 = (await call('mgr', 'post', '/my/misconduct-reports').send(R).expect(201)).body.id;
    ids.r2 = (await call('mgr', 'post', '/my/misconduct-reports').send({ ...R, misconduct: 'Late four times this month', happenedOn: shift(-2) }).expect(201)).body.id;
    expect((await call('mgr', 'get', '/my/misconduct-reports').expect(200)).body).toEqual([
      expect.objectContaining({ id: ids.r2, employee: `emp ${run}`, status: 'received' }),
      expect.objectContaining({ id: ids.r1, status: 'received' }),
    ]);
    expect(Object.keys((await call('mgr', 'get', '/my/misconduct-reports').expect(200)).body[0]).sort()).toEqual(['employee', 'filedOn', 'id', 'ref', 'status']);
    // Only HR with the key, in scope, sees the drafts.
    const drafts = (await call('hr1', 'get', '/cases/disciplinary/drafts').expect(200)).body;
    expect(drafts).toEqual([expect.objectContaining({ id: ids.r1, reportedBy: `mgr ${run}`, misconduct: R.misconduct }), expect.objectContaining({ id: ids.r2 })]);
    expect((await call('hrE2', 'get', '/cases/disciplinary/drafts').expect(200)).body).toEqual([]);
    // Founder answer 73: a count on Cases and a notice for HR in scope only (the number, never the person or the misconduct).
    expect((await counts('hr1')).casesOpen).toBe(before + 2);
    expect((await counts('hrE2')).casesOpen ?? 0).toBe(beforeE2);
    expect((await counts('mgr')).casesOpen ?? 0).toBe(0);
    const told = await inA((tx) => tx.userNotification.findMany({ where: { organizationId: org.A.id, type: 'helpdesk.case.misconduct_reported' } }));
    expect([...new Set(told.map((n) => n.recipientUserId))].sort()).toEqual([users.hr1, users.hr2].sort());
    expect(told).toHaveLength(4);
    expect(JSON.stringify(told)).not.toMatch(/Rude to a customer|Late four times|emp /);
    await call('mgr', 'get', '/cases/disciplinary/drafts').expect(403);
    for (const who of ['hr1', 'mgr', 'emp', 'adminB'] as Who[]) await call(who, 'get', `/cases/${ids.r1}`).expect(404);
    expect((await call('emp', 'get', '/my/cases').expect(200)).body.map((c: { id: string }) => c.id)).not.toContain(ids.r1);
  });

  it('HR declines a report with a reason, or opens it as a case; the manager sees only which', async () => {
    await call('hr1', 'post', `/cases/disciplinary/drafts/${ids.r1}/decline`).send({ reason: 'x' }).expect(400);
    await call('hrE2', 'post', `/cases/disciplinary/drafts/${ids.r1}/decline`).send({ reason: 'Not in my scope' }).expect(404);
    await call('mgr', 'post', `/cases/disciplinary/drafts/${ids.r1}/decline`).send({ reason: 'Changed my mind' }).expect(403);
    await call('hr1', 'post', `/cases/disciplinary/drafts/${ids.r1}/decline`).send({ reason: 'A word with the employee is enough; no case.' }).expect(201);
    await call('hr1', 'post', `/cases/disciplinary/drafts/${ids.r1}/decline`).send({ reason: 'Again' }).expect(409);
    await call('hr1', 'post', `/cases/disciplinary/drafts/${ids.r1}/open`).expect(409);
    const st = await inA((tx) => tx.speakupCaseStep.findFirstOrThrow({ where: { caseId: ids.r1, kind: 'report_declined' } }));
    expect(st.data).toMatchObject({ reason: 'A word with the employee is enough; no case.' });
    await expect(inA((tx) => tx.speakupCaseStep.create({ data: { organizationId: org.A.id, caseId: ids.r1, kind: 'report_declined', actorUserId: users.hr1, data: {} } }))).rejects.toThrow(/declined_check/);
    const opened = (await call('hr1', 'post', `/cases/disciplinary/drafts/${ids.r2}/open`).expect(201)).body;
    expect(opened.id).toBe(ids.r2);
    expect(await detail('hr1', ids.r2)).toMatchObject({ kind: 'disciplinary', stage: 'Opened', respondent: `emp ${run}`, report: { category: 'Late four times this month' }, members: [expect.objectContaining({ id: users.hr1 })] });
    const mine = (await call('mgr', 'get', '/my/misconduct-reports').expect(200)).body;
    expect(mine.map((r: { id: string; status: string }) => [r.id, r.status])).toEqual([[ids.r2, 'opened'], [ids.r1, 'declined']]);
    expect(JSON.stringify(mine)).not.toContain('A word with the employee');
    await call('mgr', 'get', `/cases/${ids.r2}`).expect(404);
    expect((await call('hr1', 'get', '/cases/disciplinary/drafts').expect(200)).body).toEqual([]);
    // Decided reports leave the count (the opened one counts as an open case hr1 is on).
    expect((await (await request(server()).get('/api/v1/workspace/counts').set('Authorization', `Bearer ${token.hr1}`)).body).casesOpen).toBeGreaterThanOrEqual(1);
  });

  it('another company never sees these cases', async () => {
    for (const id of [ids.c, ids.c2, ids.r1, ids.r2]) await call('adminB', 'get', `/cases/${id}`).expect(404);
    expect((await call('adminB', 'get', '/cases/disciplinary/drafts').expect(200)).body).toEqual([]);
    expect((await call('hrB', 'get', '/cases').expect(200)).body).toEqual([]);
  });
});
