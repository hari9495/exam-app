import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { markSteppedUp } from './fixtures/step-up';

// Assessments AS-1 (answers 2009, 2010, 2017): the question bank's review, versions, duplicate check, alt text and
// translations. Positive and negative for every rule, against the real database (RLS on).
describe('Question bank review and versions (AS-1)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  const org = {} as Record<'A' | 'B', string>;
  const slug = {} as Record<'A' | 'B', string>;
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'author' | 'reviewer' | 'third' | 'auditor' | 'admin' | 'writerB';
  const token = {} as Record<Who, string>;
  const user = {} as Record<Who, string>;
  const api = (who: Who | string, method: 'get' | 'post' | 'put', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${(token as Record<string, string>)[who] ?? who}`);
  const inOrg = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, fn);
  const setting = (key: string, value: string) =>
    inOrg('A', async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A, key } });
      await tx.setting.create({ data: { organizationId: org.A, scopeType: 'tenant', scopeId: org.A, key, value } });
    });
  const mcq = (text: string, extra: Record<string, unknown> = {}) => ({ type: 'single_mcq', text, difficulty: 'medium', marks: 2, options: [{ text: 'filter() is terminal', isCorrect: false }, { text: 'map() is lazy', isCorrect: true }], ...extra });
  const queueItem = async (who: Who, questionId: string) => ((await api(who, 'get', '/question-bank/reviews').expect(200)).body.changes as { id: string; questionId: string; rowVersion: number; duplicate: { percent: number } | null; kind: string; changed: string[] }[]).find((c) => c.questionId === questionId);
  const audits = (entityId: string) => inOrg('A', (tx) => tx.auditLog.findMany({ where: { entityId }, select: { action: true } })).then((r) => r.map((x) => x.action));

  beforeAll(async () => {
    app = await bootAdminApp();
    http = app.getHttpServer();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `qbr-plan-${run}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `QBR ${k}`, slug: `qbr-${k.toLowerCase()}-${run}`, planId } });
      org[k] = o.id;
      slug[k] = o.slug;
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string][] = [
      ['author', 'A', 'recruiter'],
      ['reviewer', 'A', 'recruiter'],
      ['third', 'A', 'recruiter'],
      ['auditor', 'A', 'auditor'],
      ['admin', 'A', 'org_admin'],
      ['writerB', 'B', 'recruiter'],
    ];
    for (const [who, k, role] of roster) {
      const email = `${who}-${run}@qbr.test`;
      user[who] = (await inOrg(k, (tx) => tx.user.create({ data: { organizationId: org[k], email, name: who, passwordHash: hash, role } }))).id;
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
      await prisma.organization.delete({ where: { id: org[k] } }).catch(() => undefined);
    }
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  let q1: string;

  it('a new question is a draft nobody can use; only its author changes and submits it', async () => {
    q1 = (await api('author', 'post', '/question-bank/questions').send(mcq(`Which Java Stream operation is lazy ${run}?`, { category: 'Backend L2' })).expect(201)).body.id;
    const row = (await api('author', 'get', `/question-bank/questions/${q1}`).expect(200)).body;
    expect(row).toMatchObject({ status: 'draft', version: 1, openChange: null });
    // negative: another writer may not change or submit someone else's draft (they would then be both writer and reviewer).
    await api('reviewer', 'put', `/question-bank/questions/${q1}`).send(mcq('Changed by someone else')).expect(403);
    await api('reviewer', 'post', `/question-bank/questions/${q1}/submit`).expect(403);
    await api('author', 'put', `/question-bank/questions/${q1}`).send(mcq(`Which Java Stream operation is lazy and returns a stream ${run}?`, { category: 'Backend L2' })).expect(200);
    expect((await api('author', 'post', `/question-bank/questions/${q1}/submit`).expect(200)).body).toMatchObject({ state: 'in_review', duplicate: null, needsSecond: false });
    await api('author', 'post', `/question-bank/questions/${q1}/submit`).expect(409);
    expect(await audits(q1)).toEqual(expect.arrayContaining(['question.created', 'question.submitted']));
  });

  it('negative: the author never sees their own change in the queue and cannot approve it (also refused by the database)', async () => {
    expect(await queueItem('author', q1)).toBeUndefined();
    const item = (await queueItem('reviewer', q1))!;
    expect(item.kind).toBe('new');
    await api('author', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(403);
    await expect(inOrg('A', (tx) => tx.questionRevision.update({ where: { id: item.id }, data: { reviewerId: user.author } }))).rejects.toThrow();
  });

  it('asking for changes needs a note, tells the author in the app, and the author submits again', async () => {
    const item = (await queueItem('reviewer', q1))!;
    await api('reviewer', 'post', `/question-bank/reviews/${item.id}/changes`).send({ rowVersion: item.rowVersion, note: 'no' }).expect(400);
    await api('reviewer', 'post', `/question-bank/reviews/${item.id}/changes`).send({ rowVersion: item.rowVersion, note: 'Name the terminal operation too.', comments: { text: 'Say which one is terminal.' } }).expect(204);
    const note = await inOrg('A', (tx) => tx.userNotification.findFirst({ where: { recipientUserId: user.author, type: 'asmt.question.changes_requested', entityId: q1 } }));
    expect(note?.contextText).toBe('Name the terminal operation too.');
    expect((await api('author', 'get', `/question-bank/questions/${q1}`).expect(200)).body.openChange).toMatchObject({ state: 'changes_requested', note: 'Name the terminal operation too.', fieldComments: { text: 'Say which one is terminal.' } });
    await api('author', 'put', `/question-bank/questions/${q1}`).send(mcq(`Which Java Stream operation is lazy and returns a new stream ${run}?`, { category: 'Backend L2' })).expect(200);
    await api('author', 'post', `/question-bank/questions/${q1}/submit`).expect(200);
  });

  it('another person approves: the question becomes usable as v1; a stale approval is refused', async () => {
    const item = (await queueItem('reviewer', q1))!;
    await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion - 1 }).expect(409);
    expect((await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(200)).body).toEqual({ state: 'approved', version: 1 });
    // A second press with the same version (two reviewers at once) is refused.
    await api('third', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(409);
    const row = (await api('author', 'get', `/question-bank/questions/${q1}`).expect(200)).body;
    expect(row).toMatchObject({ status: 'approved', version: 1, approvedBy: 'reviewer' });
    expect((await api('author', 'get', `/questions/${q1}`).expect(200)).body.status).toBe('active');
    expect(await audits(q1)).toEqual(expect.arrayContaining(['question.changes_requested', 'question.approved']));
  });

  it('a big change (the answer key) makes v2 for review; the question in use keeps v1 until it is approved', async () => {
    const changed = mcq(`Which Java Stream operation is lazy and returns a new stream ${run}?`, { category: 'Backend L2', options: [{ text: 'filter() is terminal', isCorrect: true }, { text: 'map() is lazy', isCorrect: false }] });
    expect((await api('author', 'put', `/question-bank/questions/${q1}`).send(changed).expect(200)).body).toEqual({ saved: 'major', version: 2 });
    await api('author', 'post', `/question-bank/questions/${q1}/submit`).expect(200);
    const inUse = (await api('author', 'get', `/questions/${q1}`).expect(200)).body;
    expect(inUse.options.find((o: { text: string }) => o.text === 'map() is lazy').isCorrect).toBe(true);
    // negative: a change in review cannot be changed again until withdrawn.
    await api('author', 'put', `/question-bank/questions/${q1}`).send(changed).expect(409);
    const item = (await queueItem('reviewer', q1))!;
    expect(item).toMatchObject({ kind: 'major', changed: ['options'] });
    expect((await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(200)).body).toEqual({ state: 'approved', version: 2 });
    const now = (await api('author', 'get', `/questions/${q1}`).expect(200)).body;
    expect(now.options.find((o: { text: string }) => o.text === 'filter() is terminal').isCorrect).toBe(true);
    expect((await api('author', 'get', `/question-bank/questions/${q1}`).expect(200)).body.history.filter((h: { state: string }) => h.state === 'approved').map((h: { version: number }) => h.version)).toEqual([2, 1]);
  });

  it('negative: a small change (marks) keeps the version; nothing changed is refused; a withdrawn change leaves v2 as it was', async () => {
    const base = mcq(`Which Java Stream operation is lazy and returns a new stream ${run}?`, { category: 'Backend L2', options: [{ text: 'filter() is terminal', isCorrect: true }, { text: 'map() is lazy', isCorrect: false }] });
    await api('author', 'put', `/question-bank/questions/${q1}`).send(base).expect(400);
    expect((await api('author', 'put', `/question-bank/questions/${q1}`).send({ ...base, marks: 3 }).expect(200)).body).toEqual({ saved: 'minor', version: 2 });
    await api('author', 'post', `/question-bank/questions/${q1}/submit`).expect(200);
    await api('reviewer', 'post', `/question-bank/questions/${q1}/withdraw`).expect(403);
    await api('author', 'post', `/question-bank/questions/${q1}/withdraw`).expect(204);
    expect((await api('author', 'get', `/questions/${q1}`).expect(200)).body.marks).toBe(2);
    expect(await queueItem('reviewer', q1)).toBeUndefined();
  });

  it('a near-duplicate must be confirmed "not a duplicate" before approval', async () => {
    const dup = (await api('author', 'post', '/question-bank/questions').send(mcq(`Which Java Stream operation is lazy and returns a new stream ${run}`)).expect(201)).body.id;
    const sub = (await api('author', 'post', `/question-bank/questions/${dup}/submit`).expect(200)).body;
    expect(sub.duplicate).toMatchObject({ id: q1 });
    expect(sub.duplicate.percent).toBeGreaterThanOrEqual(90);
    const item = (await queueItem('reviewer', dup))!;
    await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(409);
    await api('reviewer', 'post', `/question-bank/reviews/${item.id}/not-duplicate`).send({ rowVersion: item.rowVersion }).expect(204);
    await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion + 1 }).expect(200);
    expect(await audits(dup)).toContain('question.duplicate_cleared');
    // negative: nothing to clear on a change with no possible duplicate.
    const other = (await api('author', 'post', '/question-bank/questions').send(mcq(`A van covers 180 km in 3 hours ${run}. How far in 5?`)).expect(201)).body.id;
    await api('author', 'post', `/question-bank/questions/${other}/submit`).expect(200);
    const o = (await queueItem('reviewer', other))!;
    await api('reviewer', 'post', `/question-bank/reviews/${o.id}/not-duplicate`).send({ rowVersion: o.rowVersion }).expect(400);
  });

  it('every image needs alt text before it can be submitted', async () => {
    const id = (await api('author', 'post', '/question-bank/questions').send(mcq(`Look at the packing line ${run}. Which station seals?`, { imageUrl: 'questions/line.png' })).expect(201)).body.id;
    const r = await api('author', 'post', `/question-bank/questions/${id}/submit`).expect(400);
    expect(r.body.message).toMatch(/alt text to the question image/);
    await api('author', 'put', `/question-bank/questions/${id}`).send(mcq(`Look at the packing line ${run}. Which station seals?`, { imageUrl: 'questions/line.png', imageAlt: 'A packing line with four stations' })).expect(200);
    await api('author', 'post', `/question-bank/questions/${id}/submit`).expect(200);
  });

  it('a collection in the second-approver setting needs a third person (default off)', async () => {
    await setting('asmt.bank.second_approver_collections', 'Food safety');
    const id = (await api('author', 'post', '/question-bank/questions').send(mcq(`Which record shows a CCP deviation ${run}?`, { category: 'Food safety' })).expect(201)).body.id;
    expect((await api('author', 'post', `/question-bank/questions/${id}/submit`).expect(200)).body.needsSecond).toBe(true);
    let item = (await queueItem('reviewer', id))!;
    expect((await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(200)).body).toEqual({ state: 'in_review', waitingFor: 'second approval' });
    expect(await queueItem('reviewer', id)).toBeUndefined();
    await api('reviewer', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion + 1 }).expect(403);
    expect((await api('author', 'get', `/questions/${id}`).expect(200)).body.status).toBe('draft');
    item = (await queueItem('third', id))!;
    await api('third', 'post', `/question-bank/reviews/${item.id}/approve`).send({ rowVersion: item.rowVersion }).expect(200);
    expect((await api('author', 'get', `/questions/${id}`).expect(200)).body.status).toBe('active');
    expect(await audits(id)).toEqual(expect.arrayContaining(['question.first_approval', 'question.approved']));
  });

  it('translations: English only by default; a switched-on language is reviewed by someone other than its writer', async () => {
    const t = { text: 'कौन सा Java Stream ऑपरेशन lazy है?', options: ['filter() terminal है', 'map() lazy है'], aiAssisted: true };
    await api('reviewer', 'put', `/question-bank/questions/${q1}/translations/hi`).send(t).expect(400);
    expect((await api('author', 'get', '/question-bank/settings').expect(200)).body).toMatchObject({ languages: [], duplicatePercent: 90, provisionalAnswers: 200, packs: ['aptitude', 'english', 'core_it'] });
    await setting('asmt.languages', 'hi');
    await api('reviewer', 'put', `/question-bank/questions/${q1}/translations/ta`).send(t).expect(400);
    await api('reviewer', 'put', `/question-bank/questions/${q1}/translations/hi`).send({ ...t, options: ['only one'] }).expect(400);
    await api('reviewer', 'put', `/question-bank/questions/${q1}/translations/hi`).send(t).expect(204);
    await api('author', 'post', `/question-bank/questions/${q1}/translations/hi/submit`).expect(403);
    await api('reviewer', 'post', `/question-bank/questions/${q1}/translations/hi/submit`).expect(204);
    const tr = ((await api('author', 'get', '/question-bank/reviews').expect(200)).body.translations as { id: string; questionId: string; rowVersion: number }[]).find((x) => x.questionId === q1)!;
    expect(((await api('reviewer', 'get', '/question-bank/reviews').expect(200)).body.translations as { questionId: string }[]).some((x) => x.questionId === q1)).toBe(false);
    await api('reviewer', 'post', `/question-bank/translations/${tr.id}/decide`).send({ rowVersion: tr.rowVersion, approve: true }).expect(403);
    await api('author', 'post', `/question-bank/translations/${tr.id}/decide`).send({ rowVersion: tr.rowVersion, approve: false }).expect(400);
    await api('author', 'post', `/question-bank/translations/${tr.id}/decide`).send({ rowVersion: tr.rowVersion, approve: true }).expect(204);
    const row = ((await api('author', 'get', '/question-bank/questions').expect(200)).body as { id: string; languages: string[] }[]).find((x) => x.id === q1)!;
    expect(row.languages).toEqual(['en', 'hi']);
    expect(await audits(q1)).toEqual(expect.arrayContaining(['question.translation_drafted', 'question.translation_submitted', 'question.translation_approved']));
  });

  it('negative: readers without the writers’ key get no bank; acting for someone else changes nothing and reads no keys', async () => {
    await api('auditor', 'get', '/question-bank/questions').expect(403);
    await api('auditor', 'get', '/question-bank/reviews').expect(403);
    expect((await api('author', 'get', `/question-bank/questions/${q1}`).expect(200)).body.content.options.some((o: { isCorrect?: boolean }) => o.isCorrect)).toBe(true);
    await markSteppedUp(tenantPrisma, token.admin);
    const acting = (await api('admin', 'post', `/auth/impersonate/${user.author}`).expect(200)).body.accessToken as string;
    await api(acting, 'post', '/question-bank/questions').send(mcq('Written while acting')).expect(403);
    await api(acting, 'put', `/question-bank/questions/${q1}`).send(mcq('Changed while acting')).expect(403);
    const seen = (await api(acting, 'get', `/question-bank/questions/${q1}`).expect(200)).body;
    expect(seen.content.options.some((o: object) => 'isCorrect' in o)).toBe(false);
  });

  it('negative: another company sees none of it, through the API or the database', async () => {
    await api('writerB', 'get', `/question-bank/questions/${q1}`).expect(404);
    expect(((await api('writerB', 'get', '/question-bank/questions').expect(200)).body as unknown[]).length).toBe(0);
    expect(((await api('writerB', 'get', '/question-bank/reviews').expect(200)).body.changes as unknown[]).length).toBe(0);
    const rev = await inOrg('A', (tx) => tx.questionRevision.findFirstOrThrow({ where: { questionId: q1 } }));
    await api('writerB', 'post', `/question-bank/reviews/${rev.id}/approve`).send({ rowVersion: rev.rowVersion }).expect(404);
    expect(await inOrg('B', (tx) => tx.questionRevision.count({ where: { questionId: q1 } }))).toBe(0);
    expect(await inOrg('B', (tx) => tx.questionTranslation.count({ where: { questionId: q1 } }))).toBe(0);
  });
});
