import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { EmailService } from '../src/email/email.service';
import { QuestionReviewNudgesService } from '../src/questions/bank/review-nudges.service';

// Question bank follow-ups (founder answers 2121, 2125, 2126, 2129, 2001): the older routes never make a question usable
// without review; bulk uploads land in the review queue; code tests and images with alt text in the bank; the daily
// note to bank writers; the YukthiX key with its older alias. Positive and negative, against the real database.
describe('Question bank follow-ups', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let nudges: QuestionReviewNudgesService;
  let planId: string;
  const org = {} as Record<'A' | 'B', string>;
  const slug = {} as Record<'A' | 'B', string>;
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'author' | 'reviewer' | 'yxWriter' | 'auditor' | 'hr' | 'writerB';
  const token = {} as Record<Who, string>;
  const user = {} as Record<Who, string>;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inOrg = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, fn);
  const setting = (key: string, value: string) =>
    inOrg('A', async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A, key } });
      await tx.setting.create({ data: { organizationId: org.A, scopeType: 'tenant', scopeId: org.A, key, value } });
    });
  const mcq = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'single_mcq', text, difficulty: 'medium', marks: 2, options: [{ text: 'filter()', isCorrect: false }, { text: 'map()', isCorrect: true }], ...extra });
  const notes = (who: Who) => inOrg('A', (tx) => tx.userNotification.findMany({ where: { recipientUserId: user[who], type: 'asmt.question.review_waiting' }, select: { contextText: true, linkPath: true } }));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()));
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    nudges = app.get(QuestionReviewNudgesService);
    planId = (await prisma.plan.create({ data: { name: `qbf-plan-${run}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `QBF ${k}`, slug: `qbf-${k.toLowerCase()}-${run}`, planId } });
      org[k] = o.id;
      slug[k] = o.slug;
    }
    const hash = await argon2.hash(PASSWORD);
    // A writer holding only the YukthiX key (a permission profile), and a person with no bank key.
    const profile = (k: 'A' | 'B', name: string, keys: string[]) => inOrg(k, (tx) => tx.permissionProfile.create({ data: { organizationId: org[k], name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['author', 'A', 'recruiter', null],
      ['reviewer', 'A', 'recruiter', null],
      ['yxWriter', 'A', 'panel', await profile('A', 'yx-bank', ['asmt.bank.manage'])],
      ['auditor', 'A', 'auditor', null],
      ['hr', 'A', 'panel', await profile('A', 'no-bank', ['ats.candidate.view'])],
      ['writerB', 'B', 'recruiter', null],
    ];
    for (const [who, k, role, permissionProfileId] of roster) {
      const email = `${who.toLowerCase()}-${run}@qbf.test`;
      user[who] = (await inOrg(k, (tx) => tx.user.create({ data: { organizationId: org[k], email, name: who, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: slug[k], email, password: PASSWORD }).expect(200)).body.accessToken;
    }
  }, 240_000);

  afterAll(async () => {
    for (const k of ['A', 'B'] as const) {
      await inOrg(k, (tx) => tx.question.deleteMany({ where: { organizationId: org[k] } })).catch(() => undefined);
      await inOrg(k, (tx) => tx.setting.deleteMany({ where: { organizationId: org[k] } })).catch(() => undefined);
      await inOrg(k, (tx) => tx.userNotification.deleteMany({ where: { organizationId: org[k] } })).catch(() => undefined);
      await tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: org[k] } } })).catch(() => undefined);
      await inOrg(k, (tx) => tx.user.deleteMany({ where: { organizationId: org[k] } })).catch(() => undefined);
      await inOrg(k, (tx) => tx.permissionProfile.deleteMany({ where: { organizationId: org[k] } })).catch(() => undefined);
      await prisma.organization.delete({ where: { id: org[k] } }).catch(() => undefined);
    }
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('2121: the older routes never make a question usable without review', () => {
    let older = '';
    it('the older publish refuses (409, audited) and leaves the question as it was', async () => {
      older = (await api('author', 'post', '/questions').send(mcq(`Older route question ${run}`)).expect(201)).body.id;
      await inOrg('A', (tx) => tx.question.update({ where: { id: older }, data: { status: 'draft' } }));
      const r = await api('author', 'post', `/questions/${older}/publish`).expect(409);
      expect(r.body.message).toMatch(/another person approves it in the question bank/);
      expect((await inOrg('A', (tx) => tx.question.findUniqueOrThrow({ where: { id: older } }))).status).toBe('draft');
      expect(await inOrg('A', (tx) => tx.auditLog.count({ where: { entityId: older, action: 'question.publish_refused' } }))).toBe(1);
      await api('author', 'post', `/questions/${randomUUID()}/publish`).expect(404);
    });

    it('the older update refuses an approved question and one in review; a plain draft still changes', async () => {
      await api('author', 'patch', `/questions/${older}`).send(mcq(`Older route question ${run} (fixed)`)).expect(200);
      await api('author', 'post', `/question-bank/questions/${older}/submit`).expect(200);
      expect((await api('author', 'patch', `/questions/${older}`).send(mcq('Changed in review')).expect(409)).body.message).toMatch(/in review/);
      const item = ((await api('reviewer', 'get', '/question-bank/reviews').expect(200)).body.changes as { id: string; questionId: string; rowVersion: number }[]).find((c) => c.questionId === older)!;
      await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(200);
      expect((await api('author', 'patch', `/questions/${older}`).send(mcq('Changed after approval')).expect(409)).body.message).toMatch(/Change it in the question bank/);
      expect((await api('author', 'get', `/questions/${older}`).expect(200)).body.text).toBe(`Older route question ${run} (fixed)`);
    });

    it('a bulk upload lands as drafts in the review queue, the uploader as author (who cannot approve them)', async () => {
      const csv = ['Type,Text,Difficulty,Marks,Option1Text,Option1Correct,Option2Text,Option2Correct', `true_false,Bulk ${run} one,easy,2,True,TRUE,False,FALSE`, `true_false,Bulk ${run} two,easy,2,True,FALSE,False,TRUE`].join('\n');
      const out = (await api('author', 'post', '/questions/bulk-upload').attach('file', Buffer.from(csv), { filename: 'q.csv', contentType: 'text/csv' }).expect(201)).body;
      expect(out.created.map((q: { status: string }) => q.status)).toEqual(['draft', 'draft']);
      const ids = out.created.map((q: { id: string }) => q.id) as string[];
      const revs = await inOrg('A', (tx) => tx.questionRevision.findMany({ where: { questionId: { in: ids } } }));
      expect(revs.map((r) => [r.state, r.kind, r.authorId])).toEqual([['in_review', 'new', user.author], ['in_review', 'new', user.author]]);
      const queue = (await api('reviewer', 'get', '/question-bank/reviews').expect(200)).body.changes as { questionId: string }[];
      expect(ids.every((id) => queue.some((c) => c.questionId === id))).toBe(true);
      expect(((await api('author', 'get', '/question-bank/reviews').expect(200)).body.changes as { questionId: string }[]).some((c) => ids.includes(c.questionId))).toBe(false);
      expect(await inOrg('A', (tx) => tx.auditLog.count({ where: { entityId: { in: ids }, action: 'question.submitted' } }))).toBe(2);
    });
  });

  describe('keys (AS-0): the YukthiX key, with the older one as its alias', () => {
    it('asmt.bank.manage alone opens the bank; the older recruiter role still does; others are refused', async () => {
      expect((await api('yxWriter', 'get', '/question-bank/settings').expect(200)).body).toMatchObject({ enabled: true });
      const id = (await api('yxWriter', 'post', '/question-bank/questions').send(mcq(`YukthiX key question ${run}`)).expect(201)).body.id;
      await api('yxWriter', 'post', `/question-bank/questions/${id}/submit`).expect(200);
      await api('author', 'get', '/question-bank/questions').expect(200);
      await api('auditor', 'get', '/question-bank/questions').expect(403);
      await api('hr', 'get', '/question-bank/settings').expect(403);
    });

    it('assessments.enabled is on by default and follows the company setting', async () => {
      await setting('assessments.enabled', 'off');
      expect((await api('author', 'get', '/question-bank/settings').expect(200)).body.enabled).toBe(false);
      await setting('assessments.enabled', 'on');
    });
  });

  describe('2125 and 2126: code tests and images in the bank', () => {
    it('a code question is written with its tests; changing a test after approval is a big change (a new version)', async () => {
      const code = { type: 'code', text: `Sum two numbers ${run}`, difficulty: 'easy', marks: 5, options: [], languageMode: 'any', codeTests: [{ stdin: '1 2', expectedStdout: '3', weight: 1, hidden: false }] };
      const id = (await api('author', 'post', '/question-bank/questions').send(code).expect(201)).body.id;
      // negative: a code question with options is refused by the engine's checks.
      await api('author', 'post', '/question-bank/questions').send({ ...code, options: [{ text: 'x', isCorrect: true }] }).expect(400);
      expect((await api('author', 'get', `/question-bank/questions/${id}`).expect(200)).body.content.codeTests).toEqual([{ stdin: '1 2', expectedStdout: '3', weight: 1, hidden: false }]);
      await api('author', 'post', `/question-bank/questions/${id}/submit`).expect(200);
      const item = ((await api('reviewer', 'get', '/question-bank/reviews').expect(200)).body.changes as { id: string; questionId: string; rowVersion: number }[]).find((c) => c.questionId === id)!;
      await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(200);
      const changed = { ...code, codeTests: [...code.codeTests, { stdin: '5 5', expectedStdout: '10', weight: 2, hidden: true }] };
      expect((await api('author', 'put', `/question-bank/questions/${id}`).send(changed).expect(200)).body).toEqual({ saved: 'major', version: 2 });
    });

    it('an uploaded image goes on the question and an option; alt text on both is needed to submit', async () => {
      const img = (await api('author', 'post', '/questions/images').attach('file', png, { filename: 'line.png', contentType: 'image/png' }).expect(201)).body.imageUrl as string;
      // negative: not an image.
      await api('author', 'post', '/questions/images').attach('file', Buffer.from('nope'), { filename: 'x.txt', contentType: 'text/plain' }).expect(400);
      const withImages = mcq(`Which station seals ${run}?`, { imageUrl: img, imageAlt: 'A packing line', options: [{ text: 'A', isCorrect: true, imageUrl: img }, { text: 'B', isCorrect: false }] });
      const id = (await api('author', 'post', '/question-bank/questions').send(withImages).expect(201)).body.id;
      expect((await api('author', 'post', `/question-bank/questions/${id}/submit`).expect(400)).body.message).toMatch(/option A's image/);
      await api('author', 'put', `/question-bank/questions/${id}`).send({ ...withImages, optionAlts: ['A sealed carton', ''] }).expect(200);
      await api('author', 'post', `/question-bank/questions/${id}/submit`).expect(200);
    });
  });

  describe('2129: one note a day to bank writers with questions waiting for them', () => {
    it('tells each writer once (never about their own), not twice on a re-run, and again the next day', async () => {
      const now = new Date();
      const first = await nudges.sweep(now, [org.A]);
      expect(first).toBeGreaterThan(0);
      const r = await notes('reviewer');
      expect(r).toEqual([{ contextText: expect.stringMatching(/questions? wait for your review in the question bank/), linkPath: '/yx/hiring/assessments/reviews' }]);
      // The author's own questions are in the queue; others' (the YukthiX-key writer's) wait for them too.
      expect((await notes('author'))[0]?.contextText).toMatch(/^1 question waits/);
      expect(await notes('auditor')).toEqual([]);
      expect(await notes('hr')).toEqual([]);
      expect(await nudges.sweep(now, [org.A])).toBe(0);
      expect(await notes('reviewer')).toHaveLength(1);
      expect(await nudges.sweep(new Date(now.getTime() + 86_400_000), [org.A])).toBe(first);
      expect(await notes('reviewer')).toHaveLength(2);
    });

    it('negative: nothing when the company switched the note off, or assessments off; another company is never told', async () => {
      const later = new Date(Date.now() + 2 * 86_400_000);
      await setting('asmt.bank.review_reminders', 'off');
      expect(await nudges.sweep(later, [org.A])).toBe(0);
      await setting('asmt.bank.review_reminders', 'on');
      await setting('assessments.enabled', 'off');
      expect(await nudges.sweep(later, [org.A])).toBe(0);
      await setting('assessments.enabled', 'on');
      expect(await inOrg('B', (tx) => tx.userNotification.count({ where: { recipientUserId: user.writerB, type: 'asmt.question.review_waiting' } }))).toBe(0);
      expect(await inOrg('B', (tx) => tx.questionReviewNudge.count({ where: { organizationId: org.A } }))).toBe(0);
    });
  });
});
