import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { asApproved } from './fixtures/approved-question';

// Assessments remainders (answers 2241, 2285, 2286, 2287), end to end against the real database (forced RLS, the app
// role): each with the right role, the wrong role refused, another company seeing nothing and bad input saving nothing.
describe('Assessments remainders', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'adminA' | 'adminB' | 'writer' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };

  beforeAll(async () => {
    app = await bootAdminApp();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `rem-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `REM ${k}`, slug: `rem-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['writer', 'A', 'panel', ['asmt.test.manage']],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@rem.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@rem.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.asmtInstitution.deleteMany({ where: { organizationId: o } });
          await tx.exam.updateMany({ where: { organizationId: o }, data: { status: 'draft' } });
          await tx.exam.deleteMany({ where: { organizationId: o } });
          await tx.question.deleteMany({ where: { organizationId: o } });
          await tx.tag.deleteMany({ where: { organizationId: o } });
        }
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('2241 import institutions from CSV', () => {
    const CSV = ['name,code,city,coordinator_name,coordinator_email,results', 'Coromandel Institute,CIT-14,Chennai,Dr. Latha,latha@cit.test,each', 'Kongu Valley College,KVEC-22,,,,', 'Copy of CIT,cit-14,,,,', 'X,,,,,', 'Bad Mail College,BMC-1,,,not-an-email,', 'Odd Results College,ORC-1,,,,maybe'].join('\n');
    const codes = async (o: string) => (await inOrg(o, (tx) => tx.asmtInstitution.findMany({ where: { organizationId: o }, select: { code: true } }))).map((r) => r.code).sort();

    it('checks every row without saving; commit adds only the good rows, audited', async () => {
      const check = (await api('adminA', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: false }).expect(200)).body as { rows: { line: number; ok: boolean; problem: string | null }[]; added: number };
      expect(check.added).toBe(0);
      expect(check.rows.map((r) => r.ok)).toEqual([true, true, false, false, false, false]);
      expect(check.rows[2]!.problem).toMatch(/already in the list/);
      expect(check.rows[4]!.problem).toMatch(/Not an email/);
      expect(await codes(org.A.id)).toEqual([]);
      const done = (await api('adminA', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(200)).body as { added: number };
      expect(done.added).toBe(2);
      const rows = (await api('adminA', 'get', '/asmt/institutions').expect(200)).body as { code: string; resultsVisibility: string; coordinatorEmail: string | null }[];
      expect(rows.map((r) => [r.code, r.resultsVisibility, r.coordinatorEmail])).toEqual([
        ['CIT-14', 'per_candidate', 'latha@cit.test'],
        ['KVEC-22', 'aggregate', null],
      ]);
      const audit = await inOrg(org.A.id, (tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'institution.imported' } }));
      expect(audit?.actorUserId).toBe(users.adminA);
      // Importing the same file again adds nothing: the codes are now taken.
      expect(((await api('adminA', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(200)).body as { added: number }).added).toBe(0);
    });

    it('negative: bad files are a 400 with nothing saved; the wrong role is refused; another company sees nothing', async () => {
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,code\n', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,campus\nA,B', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'city\nChennai', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: '', commit: true }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,code\nA,B' }).expect(400);
      await api('adminB', 'post', '/asmt/institutions/import').send({ csv: ['name,code', ...Array.from({ length: 501 }, (_, i) => `College ${i},C-${i}`)].join('\n'), commit: true }).expect(400);
      expect(await codes(org.B.id)).toEqual([]);
      await api('reader', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(403);
      await api('writer', 'post', '/asmt/institutions/import').send({ csv: CSV, commit: true }).expect(403);
      // Company B may use the same codes: they are per company, and B still sees none of A's.
      expect(((await api('adminB', 'post', '/asmt/institutions/import').send({ csv: 'name,code\nB College,CIT-14', commit: true }).expect(200)).body as { added: number }).added).toBe(1);
      expect(((await api('adminB', 'get', '/asmt/institutions').expect(200)).body as { code: string }[]).map((r) => r.code)).toEqual(['CIT-14']);
      expect(await codes(org.A.id)).toEqual(['CIT-14', 'KVEC-22']);
    });
  });
  describe('2284 the Sections step pickers', () => {
    const q = async (text: string, difficulty: string, tag: string) =>
      (await asApproved(await api('adminA', 'post', '/questions').send({ type: 'single_mcq', text, difficulty, marks: 2, tags: [tag], options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }).expect(201))).body.id as string;

    beforeAll(async () => {
      ids.q1 = await q(`<p>Streams ${run} one</p>`, 'easy', `java-${run}`);
      ids.q2 = await q(`<p>Streams ${run} two</p>`, 'hard', `java-${run}`);
      ids.q3 = await q(`<p>Joins ${run}</p>`, 'easy', `sql-${run}`);
      ids.exam = (await api('writer', 'post', '/exams').send({ title: `Pickers ${run}` }).expect(201)).body.id;
      ids.s1 = (await api('writer', 'post', `/exams/${ids.exam}/sections`).send({ title: 'Java' }).expect(201)).body.id;
      ids.s2 = (await api('writer', 'post', `/exams/${ids.exam}/sections`).send({ title: 'SQL' }).expect(201)).body.id;
      await api('writer', 'put', `/exams/${ids.exam}/sections/${ids.s2}/questions`).send({ questionIds: [ids.q3] }).expect(200);
    });

    it('a test writer searches the bank (text only, no answer key) and saves a section; one in another section is not offered', async () => {
      const path = `/asmt/tests/${ids.exam}/sections/${ids.s1}/question-choices`;
      const all = (await api('writer', 'get', `${path}?search=${run}`).expect(200)).body as { chosen: unknown[]; choices: Record<string, unknown>[] };
      expect(all.chosen).toEqual([]);
      expect(all.choices.map((c) => c.id).sort()).toEqual([ids.q1, ids.q2].sort());
      expect(all.choices.find((c) => c.id === ids.q1)).toEqual({ id: ids.q1, text: `Streams ${run} one`, type: 'single_mcq', difficulty: 'easy', marks: 2, skills: [`java-${run}`] });
      expect(JSON.stringify(all)).not.toMatch(/isCorrect|options/);
      const hard = (await api('writer', 'get', `${path}?search=${run}&difficulty=hard`).expect(200)).body as { choices: { id: string }[] };
      expect(hard.choices.map((c) => c.id)).toEqual([ids.q2]);
      await api('writer', 'put', `/exams/${ids.exam}/sections/${ids.s1}/questions`).send({ questionIds: [ids.q1] }).expect(200);
      const after = (await api('writer', 'get', `${path}?search=${run}`).expect(200)).body as { chosen: { id: string }[]; choices: { id: string }[] };
      expect([after.chosen.map((c) => c.id), after.choices.map((c) => c.id)]).toEqual([[ids.q1], [ids.q2]]);
    });

    it('a pool section takes its skills from the step; the builder names them with their ids', async () => {
      const tag = (await api('adminA', 'get', '/tags').expect(200)).body as { id: string; name: string }[];
      const java = tag.find((t) => t.name === `java-${run}`)!.id;
      await api('writer', 'patch', `/exams/${ids.exam}/sections/${ids.s1}`).send({ selectionMode: 'pool', poolTagIds: [java], poolSize: 2 }).expect(200);
      const view = (await api('writer', 'get', `/asmt/tests/${ids.exam}`).expect(200)).body as { sections: { id: string; poolTagIds: string[]; poolTags: string[]; available: number }[] };
      expect(view.sections.find((s) => s.id === ids.s1)).toMatchObject({ poolTagIds: [java], poolTags: [`java-${run}`], available: 2 });
    });

    it('negative: the wrong role is refused, another company sees nothing, bad filters are a 400', async () => {
      const path = `/asmt/tests/${ids.exam}/sections/${ids.s1}/question-choices`;
      await api('reader', 'get', path).expect(403);
      await api('adminB', 'get', path).expect(404);
      await api('writer', 'get', `/asmt/tests/${ids.exam}/sections/${randomUUID()}/question-choices`).expect(404);
      await api('writer', 'get', `${path}?difficulty=impossible`).expect(400);
      await api('writer', 'get', `${path}?tagId=not-a-uuid`).expect(400);
      await api('writer', 'get', `/asmt/tests/${ids.exam}/sections/nope/question-choices`).expect(400);
    });
  });
  describe('2285 skill names for the tests key', () => {
    it('a test writer reads the skill names (id and name only) without the bank key', async () => {
      const rows = (await api('writer', 'get', '/asmt/tests/skills').expect(200)).body as Record<string, unknown>[];
      expect(rows.map((r) => r.name)).toEqual(expect.arrayContaining([`java-${run}`, `sql-${run}`]));
      expect(rows.every((r) => Object.keys(r).sort().join() === 'id,name')).toBe(true);
    });

    it('negative: the bank route stays the bank key\'s; the wrong role is refused; another company sees none of these', async () => {
      await api('writer', 'get', '/tags').expect(403);
      await api('reader', 'get', '/asmt/tests/skills').expect(403);
      const b = (await api('adminB', 'get', '/asmt/tests/skills').expect(200)).body as { name: string }[];
      expect(b.some((r) => r.name.includes(run))).toBe(false);
    });
  });
  describe('2287 Restore an archived test', () => {
    it('a test writer restores an archived draft as a draft and a published test as published, audited', async () => {
      const draft = (await api('writer', 'post', '/exams').send({ title: `Archived draft ${run}` }).expect(201)).body.id as string;
      await request(http).delete(`/api/v1/exams/${draft}`).set('Authorization', `Bearer ${token.writer}`).expect(200);
      expect((await api('writer', 'post', `/asmt/tests/${draft}/restore`).expect(200)).body).toEqual({ status: 'draft' });
      const pub = (await api('writer', 'post', '/exams').send({ title: `Archived live ${run}` }).expect(201)).body.id as string;
      const sec = (await api('writer', 'post', `/exams/${pub}/sections`).send({ title: 'One' }).expect(201)).body.id;
      await api('writer', 'put', `/exams/${pub}/sections/${sec}/questions`).send({ questionIds: [ids.q2] }).expect(200);
      await api('writer', 'post', `/exams/${pub}/publish`).expect(201);
      await request(http).delete(`/api/v1/exams/${pub}`).set('Authorization', `Bearer ${token.writer}`).expect(200);
      expect((await api('writer', 'get', `/asmt/tests/${pub}`).expect(200)).body.status).toBe('archived');
      expect((await api('writer', 'post', `/asmt/tests/${pub}/restore`).expect(200)).body).toEqual({ status: 'published' });
      const audit = await inOrg(org.A.id, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'exam.restored', entityId: { in: [draft, pub] } }, select: { actorUserId: true } }));
      expect(audit.map((a) => a.actorUserId)).toEqual([users.writer, users.writer]);
      ids.restored = pub;
    });

    it('negative: a test that is not archived is a 409; the wrong role is refused; another company gets 404; a bad id is a 400', async () => {
      await api('writer', 'post', `/asmt/tests/${ids.restored}/restore`).expect(409);
      await request(http).delete(`/api/v1/exams/${ids.restored}`).set('Authorization', `Bearer ${token.writer}`).expect(200);
      await api('reader', 'post', `/asmt/tests/${ids.restored}/restore`).expect(403);
      await api('adminB', 'post', `/asmt/tests/${ids.restored}/restore`).expect(404);
      await api('writer', 'post', '/asmt/tests/not-a-uuid/restore').expect(400);
      expect((await api('writer', 'get', `/asmt/tests/${ids.restored}`).expect(200)).body.status).toBe('archived');
    });
  });

  describe('2307 Restore asks why while a fairness finding is open', () => {
    let exam = '';
    beforeAll(async () => {
      exam = (await api('writer', 'post', '/exams').send({ title: `Fairness retired ${run}` }).expect(201)).body.id as string;
      await request(http).delete(`/api/v1/exams/${exam}`).set('Authorization', `Bearer ${token.writer}`).expect(200);
      await inOrg(org.A.id, (tx) => tx.asmtFairnessReview.create({ data: { organizationId: org.A.id, examId: exam, finding: 'Pass rate for women is 70 % of the highest group', openedBy: users.writer, decision: 'retire', reason: 'Gap too wide for now', decidedBy: users.writer, decidedAt: new Date() } }));
    });

    it('negative: no reason, a short one or a bad body is a 400 and the test stays archived; another company gets 404', async () => {
      expect((await api('writer', 'get', `/asmt/tests/${exam}`).expect(200)).body.restoreNeedsReason).toBe(true);
      expect((await api('writer', 'post', `/asmt/tests/${exam}/restore`).expect(400)).body.code).toBe('REASON_NEEDED');
      await api('writer', 'post', `/asmt/tests/${exam}/restore`).send({ reason: 'too short' }).expect(400);
      await api('writer', 'post', `/asmt/tests/${exam}/restore`).send({ reason: 42 }).expect(400);
      await api('writer', 'post', `/asmt/tests/${exam}/restore`).send({ reason: 'Questions fixed and re-checked by the panel', extra: 1 }).expect(400);
      await api('reader', 'post', `/asmt/tests/${exam}/restore`).send({ reason: 'Questions fixed and re-checked by the panel' }).expect(403);
      await api('adminB', 'post', `/asmt/tests/${exam}/restore`).send({ reason: 'Questions fixed and re-checked by the panel' }).expect(404);
      expect((await api('writer', 'get', `/asmt/tests/${exam}`).expect(200)).body.status).toBe('archived');
    });

    it('with a reason of 10 letters or more it is restored, and the reason is in the audit entry', async () => {
      expect((await api('writer', 'post', `/asmt/tests/${exam}/restore`).send({ reason: 'Questions fixed and re-checked by the panel' }).expect(200)).body).toEqual({ status: 'draft' });
      const a = await inOrg(org.A.id, (tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'exam.restored', entityId: exam } }));
      expect(JSON.parse(a.metadataJson ?? '{}')).toMatchObject({ status: 'draft', reason: 'Questions fixed and re-checked by the panel' });
      // A finding decided "keep" is closed: Restore needs no reason.
      await request(http).delete(`/api/v1/exams/${exam}`).set('Authorization', `Bearer ${token.writer}`).expect(200);
      await inOrg(org.A.id, (tx) => tx.asmtFairnessReview.create({ data: { organizationId: org.A.id, examId: exam, finding: 'Re-checked', openedBy: users.writer, openedAt: new Date(Date.now() + 1000), decision: 'keep', reason: 'Within the four-fifths rule now', decidedBy: users.writer, decidedAt: new Date() } }));
      expect((await api('writer', 'get', `/asmt/tests/${exam}`).expect(200)).body.restoreNeedsReason).toBe(false);
      await api('writer', 'post', `/asmt/tests/${exam}/restore`).expect(200);
    });
  });
});
