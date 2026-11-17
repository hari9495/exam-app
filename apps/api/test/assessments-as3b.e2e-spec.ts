import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { asApproved } from './fixtures/approved-question';

// Assessments AS-3 part 2 (answers 2014, 2211; PRC-29, PRC-07), end to end against the real database (forced RLS, the
// app role): institutions, a drive's campus form and eligibility, public registration with duplicates and the cap,
// merging, the college-wise report, the coordinator's link and view, and bulk reminders and revokes.
describe('Assessments AS-3 part 2: campus kit', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let runtimeHttp: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  const sent: { to: string; text?: string }[] = [];
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'adminA' | 'adminB' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const DAY = 24 * 60 * 60 * 1000;
  const SETTINGS = { fields: { phone: 'optional', branch: 'required', graduationYear: 'required', cgpa: 'required' }, branches: ['CSE', 'IT'], graduationYear: 2027, minCgpa: 6.5, cap: 4, tellIneligible: true };
  const student = (n: string, campus: Record<string, unknown>) => ({ examId: ids.exam, name: `Student ${n}`, email: `${n}-${run}@college.test`, campus: { institutionId: ids.cit, branch: 'CSE', graduationYear: 2027, cgpa: 8, ...campus } });
  const register = (body: object) => request(http).post(`/api/v1/public/walk-in/${org.A.slug}/register`).send(body);
  const reg = (email: string) => inOrg(org.A.id, (tx) => tx.asmtRegistrant.findFirstOrThrow({ where: { email } }));
  const linkFrom = (i: number) => /\/campus\/([A-Za-z0-9_-]+)/.exec(sent[i]!.text ?? '')![1]!;

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) =>
      b.overrideProvider(EmailService).useValue({
        send: jest.fn(async (m: { to: string; text?: string }) => {
          sent.push(m);
          return { success: true };
        }),
      }),
    );
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `as3b-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `AS3B ${k}`, slug: `as3b-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@as3b.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@as3b.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    const q = (await asApproved(await api('adminA', 'post', '/questions').send({ type: 'single_mcq', text: `Campus ${run}?`, difficulty: 'easy', marks: 10, options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }).expect(201))).body.id;
    ids.exam = (await api('adminA', 'post', '/exams').send({ title: `Campus aptitude ${run}` }).expect(201)).body.id;
    const section = (await api('adminA', 'post', `/exams/${ids.exam}/sections`).send({ title: 'One' }).expect(201)).body.id;
    await api('adminA', 'put', `/exams/${ids.exam}/sections/${section}/questions`).send({ questionIds: [q] }).expect(200);
    await api('adminA', 'post', `/exams/${ids.exam}/publish`).expect(201);
    // 2214: a new drive is a walk-in group (the existing route); the campus kit opens on it.
    ids.drive = (await api('adminA', 'post', '/walk-in-groups').send({ name: `Campus TN ${run}` }).expect(201)).body.id;
    await inOrg(org.A.id, (tx) => tx.exam.update({ where: { id: ids.exam }, data: { walkInGroupId: ids.drive, walkInEnabled: true } }));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.asmtRegistrant.deleteMany({ where: { organizationId: o } });
          await tx.asmtCoordinatorLink.deleteMany({ where: { organizationId: o } });
          await tx.asmtInstitution.deleteMany({ where: { organizationId: o } });
          await tx.exam.deleteMany({ where: { organizationId: o } });
          await tx.driveSession.deleteMany({ where: { organizationId: o } });
          await tx.walkInGroup.deleteMany({ where: { organizationId: o } });
          await tx.question.deleteMany({ where: { organizationId: o } });
          await tx.candidate.deleteMany({ where: { organizationId: o } });
        }
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  describe('institutions and the campus form', () => {
    it('adds colleges (code unique, any case); another company sees none; a results reader is refused', async () => {
      ids.cit = (await api('adminA', 'post', '/asmt/institutions').send({ name: 'Coromandel Institute', code: 'CIT-14', city: 'Chennai', coordinatorName: 'Dr. Latha', coordinatorEmail: `latha-${run}@cit.test`, resultsVisibility: 'per_candidate' }).expect(201)).body.id;
      ids.kvec = (await api('adminA', 'post', '/asmt/institutions').send({ name: 'Kongu Valley College', code: 'KVEC-22', resultsVisibility: 'none', coordinatorEmail: `senthil-${run}@kvec.test` }).expect(201)).body.id;
      await api('adminA', 'post', '/asmt/institutions').send({ name: 'Copy', code: 'cit-14', resultsVisibility: 'none' }).expect(409);
      await api('adminA', 'post', '/asmt/institutions').send({ name: 'X', code: '', resultsVisibility: 'none' }).expect(400);
      ids.other = (await api('adminB', 'post', '/asmt/institutions').send({ name: 'Other company college', code: 'OC-1', resultsVisibility: 'none' }).expect(201)).body.id;
      expect(((await api('adminB', 'get', '/asmt/institutions').expect(200)).body as { id: string }[]).map((i) => i.id)).toEqual([ids.other]);
      await api('adminB', 'put', `/asmt/institutions/${ids.cit}`).send({ name: 'Taken', code: 'T-1', resultsVisibility: 'none' }).expect(404);
      await api('reader', 'get', '/asmt/institutions').expect(403);
    });

    it('turns the drive into a campus drive; negative: a rule on a field not required, or another company’s drive, is refused', async () => {
      await api('adminA', 'put', `/asmt/drives/${ids.drive}/campus`).send({ settings: { ...SETTINGS, fields: { ...SETTINGS.fields, cgpa: 'optional' } } }).expect(400);
      await api('adminB', 'put', `/asmt/drives/${ids.drive}/campus`).send({ settings: SETTINGS }).expect(404);
      await api('adminA', 'put', `/asmt/drives/${ids.drive}/campus`).send({ settings: SETTINGS }).expect(200);
      expect((await api('adminA', 'get', `/asmt/drives/${ids.drive}/campus`).expect(200)).body.settings).toMatchObject({ minCgpa: 6.5, cap: 4 });
      const page = (await request(http).get(`/api/v1/public/walk-in/${org.A.slug}/exams?group=${ids.drive}`).expect(200)).body;
      expect(page.campus.institutions.map((i: { id: string }) => i.id).sort()).toEqual([ids.cit, ids.kvec].sort());
      expect(page.campus.fields.cgpa).toBe('required');
    });
  });

  describe('public registration', () => {
    it('an eligible student gets a link and a registration tied to the invitation', async () => {
      const res = (await register(student('s1', { rollNumber: '21CS140' })).expect(201)).body;
      expect(typeof res.token).toBe('string');
      const r = await reg(`s1-${run}@college.test`);
      expect([r.eligible, r.institutionId, r.invitationId != null]).toEqual([true, ids.cit, true]);
    });

    it('negative: an ineligible student is registered without a link and told why; missing fields, a college of another company, are refused', async () => {
      const res = (await register(student('s2', { rollNumber: '21CS141', cgpa: 5.9 })).expect(201)).body;
      expect(res).toEqual({ token: null, eligible: false, reason: 'CGPA below 6.5' });
      expect((await reg(`s2-${run}@college.test`)).invitationId).toBeNull();
      await register(student('s3', { rollNumber: '21CS142', branch: undefined })).expect(400);
      await register(student('s3', { rollNumber: '21CS142', institutionId: ids.other })).expect(400);
      await register({ ...student('s3', {}), campus: undefined }).expect(400);
    });

    it('the same roll number at the same college with another email is a possible duplicate; the same email again changes nothing', async () => {
      await register(student('s1dup', { rollNumber: '21cs140', cgpa: 9 })).expect(201);
      const dup = await reg(`s1dup-${run}@college.test`);
      const first = await reg(`s1-${run}@college.test`);
      expect(dup.duplicateOfId).toBe(first.id);
      await register(student('s2', { rollNumber: '21CS141', cgpa: 9.5 })).expect(201);
      expect((await reg(`s2-${run}@college.test`)).eligible).toBe(false);
      const view = (await api('adminA', 'get', `/asmt/drives/${ids.drive}/campus`).expect(200)).body as { registrants: { id: string; match: string }[] };
      expect(view.registrants.find((r) => r.id === dup.id)?.match).toBe('Possible duplicate');
    });

    it('negative: the cap stops new registrations (merged ones do not count)', async () => {
      await register(student('s4', { rollNumber: '21IT001', branch: 'IT', institutionId: ids.kvec })).expect(201);
      await register(student('s5', { rollNumber: '21IT002' })).expect(400);
      ids.dup = (await reg(`s1dup-${run}@college.test`)).id;
      ids.first = (await reg(`s1-${run}@college.test`)).id;
    });
  });

  describe('merge, report, coordinator', () => {
    it('merging keeps one registration, withdraws the untaken invitation and frees a place; twice is refused; another company gets 404', async () => {
      await api('adminB', 'post', `/asmt/registrants/${ids.dup}/merge`).send({ intoId: ids.first }).expect(404);
      await api('adminA', 'post', `/asmt/registrants/${ids.dup}/merge`).send({ intoId: ids.dup }).expect(400);
      await api('adminA', 'post', `/asmt/registrants/${ids.dup}/merge`).send({ intoId: ids.first }).expect(200);
      const d = await inOrg(org.A.id, (tx) => tx.asmtRegistrant.findUniqueOrThrow({ where: { id: ids.dup }, include: { invitation: true } }));
      expect([d.mergedIntoId, d.invitation?.status]).toEqual([ids.first, 'revoked']);
      // Answer 2242: the drawer links to the kept Hire candidate record; the two candidate records stay separate here.
      const first = await inOrg(org.A.id, (tx) => tx.asmtRegistrant.findUniqueOrThrow({ where: { id: ids.first } }));
      const rows = ((await api('adminA', 'get', `/asmt/drives/${ids.drive}/campus`).expect(200)).body as { registrants: { id: string; candidateId: string; mergedInto: { candidateId: string } | null }[] }).registrants;
      const dupRow = rows.find((r) => r.id === ids.dup)!;
      expect([dupRow.candidateId, dupRow.mergedInto?.candidateId]).toEqual([d.candidateId, first.candidateId]);
      expect(d.candidateId).not.toBe(first.candidateId);
      await api('adminB', 'get', `/asmt/drives/${ids.drive}/campus`).expect(404);
      await api('adminA', 'post', `/asmt/registrants/${ids.dup}/merge`).send({ intoId: ids.first }).expect(409);
      await register(student('s5', { rollNumber: '21IT002' })).expect(201);
      await api('adminA', 'post', `/asmt/registrants/${ids.first}/not-duplicate`).expect(404);
    });

    it('negative: a registration that took the test cannot be merged away', async () => {
      const first = await inOrg(org.A.id, (tx) => tx.asmtRegistrant.findUniqueOrThrow({ where: { id: ids.first }, include: { invitation: true } }));
      const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: first.invitation!.token }).expect(200)).body.accessToken;
      await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${ct}`).send({ consent: true }).expect(201);
      await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${ct}`).expect(201);
      const s5 = (await reg(`s5-${run}@college.test`)).id;
      await api('adminA', 'post', `/asmt/registrants/${ids.first}/merge`).send({ intoId: s5 }).expect(400);
    });

    it('the college-wise report counts each college without merged duplicates', async () => {
      const report = (await api('adminA', 'get', `/asmt/drives/${ids.drive}/campus`).expect(200)).body.report as { institutionId: string; registered: number; eligible: number; invited: number; attended: number }[];
      expect(report.find((c) => c.institutionId === ids.cit)).toMatchObject({ registered: 3, eligible: 2, invited: 2, attended: 1 });
      expect(report.find((c) => c.institutionId === ids.kvec)).toMatchObject({ registered: 1, eligible: 1 });
    });

    it('the coordinator gets a link by email and sees their college only; results only after the drive closes', async () => {
      await api('adminA', 'post', `/asmt/drives/${ids.drive}/coordinator-link`).send({ institutionId: ids.cit }).expect(200);
      expect(sent.at(-1)!.to).toBe(`latha-${run}@cit.test`);
      const t = linkFrom(sent.length - 1);
      const before = (await request(http).get(`/api/v1/public/campus/coordinator/${t}`).expect(200)).body;
      expect(before).toMatchObject({ college: 'Coromandel Institute', resultsShown: false, counts: { registered: 3, passed: null } });
      expect(before.registrants.every((r: { result: unknown }) => r.result === null)).toBe(true);
      expect(JSON.stringify(before)).not.toContain('KVEC');
      // The drive closes (its only session ended); this college shares each student's result.
      await inOrg(org.A.id, (tx) => tx.driveSession.create({ data: { organizationId: org.A.id, walkInGroupId: ids.drive, name: 'Day 1', startsAt: new Date(Date.now() - 2 * DAY), endsAt: new Date(Date.now() - DAY) } }));
      await tenantPrisma.forTenant(SUPER, async (tx) => {
        const a = await tx.attempt.findFirstOrThrow({ where: { invitation: { asmtRegistrants: { some: { id: ids.first } } } } });
        await tx.result.update({ where: { attemptId: a.id }, data: { passFail: 'pass', releaseOverride: null } });
      });
      const after = (await request(http).get(`/api/v1/public/campus/coordinator/${t}`).expect(200)).body;
      expect(after.resultsShown).toBe(true);
      expect(after.counts.passed).toBe(1);
      expect(after.registrants.find((r: { rollNumber: string }) => r.rollNumber === '21CS140').result).toBe('Passed');
    });

    it('negative: a new link replaces the old one; a made-up link, or a college with results not shared, shows no results', async () => {
      const old = linkFrom(sent.length - 1);
      await api('adminA', 'post', `/asmt/drives/${ids.drive}/coordinator-link`).send({ institutionId: ids.cit }).expect(200);
      await request(http).get(`/api/v1/public/campus/coordinator/${old}`).expect(404);
      await request(http).get(`/api/v1/public/campus/coordinator/${'x'.repeat(43)}`).expect(404);
      await api('adminA', 'post', `/asmt/drives/${ids.drive}/coordinator-link`).send({ institutionId: ids.kvec }).expect(200);
      const none = (await request(http).get(`/api/v1/public/campus/coordinator/${linkFrom(sent.length - 1)}`).expect(200)).body;
      expect([none.visibility, none.resultsShown, none.counts.passed]).toEqual(['none', false, null]);
      await api('adminB', 'post', `/asmt/drives/${ids.drive}/coordinator-link`).send({ institutionId: ids.cit }).expect(404);
    });
  });

  describe('bulk reminders and revokes (answer 2211)', () => {
    it('one call for many; each refusal is named and the rest go ahead; another company’s ids are refused', async () => {
      const s4 = await inOrg(org.A.id, (tx) => tx.asmtRegistrant.findFirstOrThrow({ where: { email: `s4-${run}@college.test` } }));
      const s5 = await inOrg(org.A.id, (tx) => tx.asmtRegistrant.findFirstOrThrow({ where: { email: `s5-${run}@college.test` } }));
      const dup = await inOrg(org.A.id, (tx) => tx.asmtRegistrant.findUniqueOrThrow({ where: { id: ids.dup } }));
      const remind = (await api('adminA', 'post', '/asmt/invitations/bulk').send({ action: 'remind', ids: [s4.invitationId, dup.invitationId] }).expect(200)).body;
      expect(remind.done).toBe(1);
      expect(remind.failed.map((f: { id: string }) => f.id)).toEqual([dup.invitationId]);
      const revoke = (await api('adminA', 'post', '/asmt/invitations/bulk').send({ action: 'revoke', ids: [s5.invitationId] }).expect(200)).body;
      expect(revoke).toEqual({ done: 1, failed: [] });
      expect((await api('adminB', 'post', '/asmt/invitations/bulk').send({ action: 'revoke', ids: [s4.invitationId] }).expect(200)).body.done).toBe(0);
      await api('adminA', 'post', '/asmt/invitations/bulk').send({ action: 'delete', ids: [s4.invitationId] }).expect(400);
      await api('reader', 'post', '/asmt/invitations/bulk').send({ action: 'remind', ids: [s4.invitationId] }).expect(403);
    });
  });
});
