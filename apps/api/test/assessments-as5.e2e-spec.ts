import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { notOnHold } from '../src/assessments/asmt-rules';
import { asApproved } from './fixtures/approved-question';
import { markSteppedUp } from './fixtures/step-up';
import { openIncidentIfFlagged } from '../../exam-runtime/src/integrity/integrity-analysis.service';

// Assessments AS-5 part 1 (answers 2006, 2008, 2012), end to end against the real database (forced RLS, the app role):
//   the analysis opens an incident for a flagged attempt and the candidate's result is held;
//   PRC-16/17 a reviewer takes it and gives a verdict with a reason; "attempt invalidated" asks for the second factor and
//           waits for the second reviewer the first one chose (never the first); a reader and another company see nothing;
//   PRC-27  the candidate sees the decision and appeals once, within the company window; the result is held meanwhile;
//   PRC-18  someone who did not give the verdict decides the appeal; overturning asks for the second factor;
//   legal hold: evidence of an open incident, an open appeal or a verdict still open to appeal is not purged.
describe('Assessments AS-5: integrity review and appeals', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let runtimeHttp: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  const sent: { to: string; subject: string }[] = [];
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const run = randomUUID().slice(0, 8);
  const PASSWORD = 'Corr3ct-Horse-Battery';
  type Who = 'adminA' | 'adminB' | 'proctor' | 'proctor2' | 'evaluator' | 'reader';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(http)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const cand = (ct: string, method: 'get' | 'post', path: string) => request(runtimeHttp)[method](`/api/v1${path}`).set('Authorization', `Bearer ${ct}`);
  const inOrg = <T>(o: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const REASON = 'Frames at 23:15 and 33:30 show a second person reading the screen.';

  /** A started attempt by a new candidate in company A (still running), and the candidate's token. */
  const running = async (face = false) => {
    const exam = (await api('adminA', 'post', '/exams').send({ title: `AS5 run ${run} ${randomUUID().slice(0, 4)}`, faceVerificationEnabled: face }).expect(201)).body.id;
    const section = (await api('adminA', 'post', `/exams/${exam}/sections`).send({ title: 'Java' }).expect(201)).body.id;
    await request(http).put(`/api/v1/exams/${exam}/sections/${section}/questions`).set('Authorization', `Bearer ${token.adminA}`).send({ questionIds: [ids.q] }).expect(200);
    await api('adminA', 'post', `/exams/${exam}/publish`).expect(201);
    const c = (await api('adminA', 'post', '/candidates').send({ email: `r-${randomUUID().slice(0, 8)}@as5.test`, name: 'Ravi' }).expect(201)).body.id;
    const inv = (await api('adminA', 'post', `/exams/${exam}/invitations`).send({ candidateIds: [c] }).expect(201)).body.created[0];
    const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken as string;
    const attemptId = (await cand(ct, 'post', '/attempt/start').send({ consent: true }).expect(201)).body.id as string;
    return { attemptId, ct };
  };

  /** A submitted attempt by a new candidate in company A, and the candidate's token. */
  const submitted = async () => {
    const exam = (await api('adminA', 'post', '/exams').send({ title: `AS5 ${run} ${randomUUID().slice(0, 4)}` }).expect(201)).body.id;
    const section = (await api('adminA', 'post', `/exams/${exam}/sections`).send({ title: 'Java' }).expect(201)).body.id;
    await request(http).put(`/api/v1/exams/${exam}/sections/${section}/questions`).set('Authorization', `Bearer ${token.adminA}`).send({ questionIds: [ids.q] }).expect(200);
    await api('adminA', 'post', `/exams/${exam}/publish`).expect(201);
    const c = (await api('adminA', 'post', '/candidates').send({ email: `c-${randomUUID().slice(0, 8)}@as5.test`, name: 'Asha' }).expect(201)).body.id;
    const inv = (await api('adminA', 'post', `/exams/${exam}/invitations`).send({ candidateIds: [c] }).expect(201)).body.created[0];
    const ct = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inv.token }).expect(200)).body.accessToken as string;
    const attemptId = (await cand(ct, 'post', '/attempt/start').send({ consent: true }).expect(201)).body.id as string;
    await cand(ct, 'post', '/attempt/submit').send({}).expect(201);
    return { attemptId, ct };
  };
  const flag = (attemptId: string, level: string) => inOrg(org.A.id, (tx) => openIncidentIfFlagged(tx, attemptId, level));
  const feedback = async (ct: string) => (await cand(ct, 'get', '/attempt/current').expect(200)).body.feedback;
  const onHold = async (attemptId: string) =>
    (await inOrg(org.A.id, (tx) => tx.proctoringEvent.count({ where: { attemptId, AND: [notOnHold(new Date())] } }))) === 0 &&
    (await inOrg(org.A.id, (tx) => tx.proctoringEvent.count({ where: { attemptId } }))) > 0;

  beforeAll(async () => {
    adminApp = await bootAdminApp((b) =>
      b.overrideProvider(EmailService).useValue({
        send: jest.fn(async (m: { to: string; subject: string }) => {
          sent.push({ to: m.to, subject: m.subject });
          return { success: true };
        }),
      }),
    );
    ({ app: runtimeApp } = await bootRuntimeApp());
    http = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `as5-plan-${run}`, candidateLimit: 50, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const o = await prisma.organization.create({ data: { name: `AS5 ${k}`, slug: `as5-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: o.id, slug: o.slug };
    }
    const hash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['proctor', 'A', 'panel', ['asmt.proctor']],
      ['proctor2', 'A', 'panel', ['asmt.proctor']],
      ['evaluator', 'A', 'panel', ['asmt.evaluate']],
      ['reader', 'A', 'panel', ['asmt.results.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k];
      const permissionProfileId = keys ? (await inOrg(o.id, (tx) => tx.permissionProfile.create({ data: { organizationId: o.id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(o.id, (tx) => tx.user.create({ data: { organizationId: o.id, email: `${who}-${run}@as5.test`, name: `${who} ${run}`, passwordHash: hash, role, permissionProfileId } }))).id;
      token[who] = (await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: o.slug, email: `${who}-${run}@as5.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.q = (await asApproved(await api('adminA', 'post', '/questions').send({ type: 'single_mcq', text: `Capital ${run}?`, difficulty: 'easy', marks: 10, options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }).expect(201))).body.id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        for (const o of [org.A.id, org.B.id]) {
          await tx.exam.deleteMany({ where: { organizationId: o } });
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

  it('a clear attempt gets no incident; a flagged one does, follows the latest level, and its result is held', async () => {
    const a = await submitted();
    Object.assign(ids, { attempt: a.attemptId, ct: a.ct });
    await flag(a.attemptId, 'clear');
    expect(await inOrg(org.A.id, (tx) => tx.integrityIncident.count({ where: { attemptId: a.attemptId } }))).toBe(0);
    await flag(a.attemptId, 'review');
    await flag(a.attemptId, 'high_concern');
    const inc = await inOrg(org.A.id, (tx) => tx.integrityIncident.findUniqueOrThrow({ where: { attemptId: a.attemptId } }));
    expect([inc.level, inc.status, inc.organizationId]).toEqual(['high_concern', 'open', org.A.id]);
    ids.inc = inc.id;
    expect((await feedback(a.ct)).status).toBe('held');
    // Legal hold: its evidence is kept while the incident is open.
    await inOrg(org.A.id, (tx) => tx.proctoringEvent.create({ data: { attemptId: a.attemptId, eventType: 'tab_switch', severity: 'low', occurredAt: new Date(), metadataJson: '{}' } }));
    expect(await onHold(a.attemptId)).toBe(true);
  });

  it('PRC-16: reviewers see the queue; a results reader is refused; another company sees nothing of it', async () => {
    const q = (await api('proctor', 'get', '/asmt/integrity').expect(200)).body as { id: string; level: string; status: string; test: string }[];
    expect(q.find((r) => r.id === ids.inc)).toMatchObject({ level: 'high_concern', status: 'open' });
    await api('reader', 'get', '/asmt/integrity').expect(403);
    expect((await api('adminB', 'get', '/asmt/integrity').expect(200)).body).toEqual([]);
    await api('adminB', 'get', `/asmt/integrity/${ids.inc}`).expect(404);
    await api('adminB', 'post', `/asmt/integrity/${ids.inc}/verdict`).send({ verdict: 'cleared', reason: REASON }).expect(404);
    const names = ((await api('proctor', 'get', '/asmt/integrity/reviewers').expect(200)).body as { id: string }[]).map((r) => r.id);
    expect(names).toEqual(expect.arrayContaining([users.proctor2, users.evaluator, users.adminA]));
    expect(names).not.toContain(users.proctor);
    expect(names).not.toContain(users.reader);
  });

  it('negative: a short reason, a section the attempt does not have, and invalidating through the plain verdict are refused', async () => {
    await api('proctor', 'post', `/asmt/integrity/${ids.inc}/take`).expect(200);
    await api('proctor', 'post', `/asmt/integrity/${ids.inc}/verdict`).send({ verdict: 'warning', reason: 'too short' }).expect(400);
    await api('proctor', 'post', `/asmt/integrity/${ids.inc}/verdict`).send({ verdict: 'section', reason: REASON, sectionTitle: 'SQL' }).expect(400);
    await api('proctor', 'post', `/asmt/integrity/${ids.inc}/verdict`).send({ verdict: 'attempt', reason: REASON }).expect(400);
    expect((await api('proctor', 'get', `/asmt/integrity/${ids.inc}`).expect(200)).body).toMatchObject({ status: 'open', verdict: null, reviewer: { id: users.proctor }, sections: ['Java'] });
  });

  it('invalidating asks for the second factor and a second reviewer who is someone else; only that person confirms', async () => {
    const r = await api('proctor', 'post', `/asmt/integrity/${ids.inc}/invalidate`).send({ reason: REASON, secondReviewerId: users.proctor2 });
    expect(r.status).toBe(403);
    await markSteppedUp(tenantPrisma, token.proctor);
    await api('proctor', 'post', `/asmt/integrity/${ids.inc}/invalidate`).send({ reason: REASON, secondReviewerId: users.proctor }).expect(400);
    await api('proctor', 'post', `/asmt/integrity/${ids.inc}/invalidate`).send({ reason: REASON, secondReviewerId: users.reader }).expect(400);
    expect((await api('proctor', 'post', `/asmt/integrity/${ids.inc}/invalidate`).send({ reason: REASON, secondReviewerId: users.proctor2 }).expect(200)).body.status).toBe('second_review');
    expect((await feedback(ids.ct)).status).toBe('held');
    await markSteppedUp(tenantPrisma, token.evaluator);
    await api('proctor', 'post', `/asmt/integrity/${ids.inc}/second-review`).send({ confirm: true, reason: REASON }).expect(403);
    await api('evaluator', 'post', `/asmt/integrity/${ids.inc}/second-review`).send({ confirm: true, reason: REASON }).expect(403);
    await api('proctor2', 'post', `/asmt/integrity/${ids.inc}/second-review`).send({ confirm: true, reason: REASON }).expect(403);
    await markSteppedUp(tenantPrisma, token.proctor2);
    expect((await api('proctor2', 'post', `/asmt/integrity/${ids.inc}/second-review`).send({ confirm: true, reason: 'I agree with the frames.' }).expect(200)).body.status).toBe('decided');
    const inc = (await api('proctor2', 'get', `/asmt/integrity/${ids.inc}`).expect(200)).body;
    expect(inc).toMatchObject({ status: 'decided', verdict: 'attempt', decidedBy: { id: users.proctor }, confirmedBy: { id: users.proctor2 }, secondReviewer: { id: users.proctor2 } });
    // The company default: 7 days to appeal.
    const days = (Date.parse(inc.appealClosesAt) - Date.parse(inc.confirmedAt)) / 86_400_000;
    expect(Math.round(days)).toBe(7);
    const audits = await inOrg(org.A.id, (tx) => tx.auditLog.findMany({ where: { entityId: ids.inc }, select: { action: true } }));
    expect(audits.map((a) => a.action).sort()).toEqual(['asmt.incident.invalidation_confirmed', 'asmt.incident.invalidation_proposed', 'asmt.incident.taken']);
  });

  it('negative: the database refuses a confirmer who proposed it, and the app never deletes a verdict', async () => {
    await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.integrityIncident.update({ where: { id: ids.inc }, data: { confirmedBy: users.proctor } }))).rejects.toThrow(/check/);
    await expect(inOrg(org.A.id, (tx) => tx.integrityIncident.delete({ where: { id: ids.inc } }))).rejects.toThrow(/permission denied/);
  });

  it('PRC-27: the candidate sees the decision, not a score, with the window; an appeal is held, once, in their words', async () => {
    const fb = await feedback(ids.ct);
    expect(fb).toMatchObject({ status: 'invalidated', percentage: null, integrity: { verdict: 'attempt', reason: REASON, canAppeal: true, appeal: null } });
    await cand(ids.ct, 'post', '/attempt/appeal').send({ text: 'short' }).expect(400);
    await cand(ids.ct, 'post', '/attempt/appeal').send({ text: '          ' }).expect(400);
    await cand(ids.ct, 'post', '/attempt/appeal').send({ text: 'My brother walked in by mistake; I asked him to leave.' }).expect(201);
    await cand(ids.ct, 'post', '/attempt/appeal').send({ text: 'Again, my brother walked in by mistake.' }).expect(409);
    expect(await feedback(ids.ct)).toMatchObject({ status: 'held', integrity: { appeal: { status: 'open' } } });
    expect(await onHold(ids.attempt)).toBe(true);
  });

  it('PRC-18: the reviewers who gave the verdict may not decide the appeal; overturning asks for the second factor', async () => {
    const list = (await api('evaluator', 'get', '/asmt/appeals').expect(200)).body as { id: string; incidentId: string; status: string; excluded: string[] }[];
    const appeal = list.find((a) => a.incidentId === ids.inc)!;
    expect(appeal).toMatchObject({ status: 'open', excluded: expect.arrayContaining([users.proctor, users.proctor2]) });
    ids.appeal = appeal.id;
    await api('proctor', 'post', `/asmt/appeals/${ids.appeal}/uphold`).send({ reason: REASON }).expect(403);
    await api('proctor2', 'post', `/asmt/appeals/${ids.appeal}/uphold`).send({ reason: REASON }).expect(403);
    await api('reader', 'get', '/asmt/appeals').expect(403);
    expect((await api('adminB', 'get', '/asmt/appeals').expect(200)).body).toEqual([]);
    await api('evaluator', 'post', `/asmt/appeals/${ids.appeal}/uphold`).send({ reason: 'no' }).expect(400);
    const cold = await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `adminA-${run}@as5.test`, password: PASSWORD }).expect(200);
    await request(http).post(`/api/v1/asmt/appeals/${ids.appeal}/overturn`).set('Authorization', `Bearer ${cold.body.accessToken}`).send({ reason: REASON }).expect(403);
    // The database refuses it too.
    await expect(inOrg(org.A.id, (tx) => tx.integrityAppeal.update({ where: { id: ids.appeal }, data: { status: 'upheld', reason: REASON, decidedBy: users.proctor, decidedAt: new Date() } }))).rejects.toThrow(/did not give the verdict/);
    expect((await api('evaluator', 'post', `/asmt/appeals/${ids.appeal}/overturn`).send({ reason: 'The second person was a family member who left at once.' }).expect(200)).body.status).toBe('overturned');
    await api('evaluator', 'post', `/asmt/appeals/${ids.appeal}/uphold`).send({ reason: REASON }).expect(409);
  });

  it('after an overturn the candidate gets their result again and the evidence leaves the hold', async () => {
    const fb = await feedback(ids.ct);
    expect(fb.status).not.toBe('invalidated');
    expect(fb.status).not.toBe('held');
    expect(fb.integrity).toMatchObject({ verdict: 'attempt', appeal: { status: 'overturned', reason: 'The second person was a family member who left at once.' } });
    expect(await onHold(ids.attempt)).toBe(false);
  });

  it('a warning is final at once with a window; cleared has none; after the window the candidate may not appeal', async () => {
    const w = await submitted();
    await flag(w.attemptId, 'review');
    const wi = (await inOrg(org.A.id, (tx) => tx.integrityIncident.findUniqueOrThrow({ where: { attemptId: w.attemptId } }))).id;
    expect((await api('evaluator', 'post', `/asmt/integrity/${wi}/verdict`).send({ verdict: 'warning', reason: REASON }).expect(200)).body.appealClosesAt).toBeTruthy();
    expect(await feedback(w.ct)).toMatchObject({ integrity: { verdict: 'warning', canAppeal: true } });
    expect((await feedback(w.ct)).status).not.toBe('held');
    await api('evaluator', 'post', `/asmt/integrity/${wi}/verdict`).send({ verdict: 'cleared', reason: REASON }).expect(409);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.integrityIncident.update({ where: { id: wi }, data: { appealClosesAt: new Date(Date.now() - 60_000) } }));
    await cand(w.ct, 'post', '/attempt/appeal').send({ text: 'I did nothing wrong at all here.' }).expect(400);
    expect((await feedback(w.ct)).integrity.canAppeal).toBe(false);

    const c = await submitted();
    await flag(c.attemptId, 'review');
    const ci = (await inOrg(org.A.id, (tx) => tx.integrityIncident.findUniqueOrThrow({ where: { attemptId: c.attemptId } }))).id;
    expect((await api('evaluator', 'post', `/asmt/integrity/${ci}/verdict`).send({ verdict: 'cleared', reason: 'Looked at every frame; nothing wrong.' }).expect(200)).body.appealClosesAt).toBeNull();
    expect((await feedback(c.ct)).integrity).toBeUndefined();
    await cand(c.ct, 'post', '/attempt/appeal').send({ text: 'Nothing to appeal here at all.' }).expect(400);
  });

  it('a second reviewer may send an invalidation back; a person can open an incident on an unflagged attempt', async () => {
    const s = await submitted();
    ids.manual = (await api('proctor', 'post', `/asmt/integrity/attempts/${s.attemptId}/open`).expect(201)).body.id;
    await api('proctor', 'post', `/asmt/integrity/attempts/${s.attemptId}/open`).expect(409);
    await api('proctor', 'post', `/asmt/integrity/${ids.manual}/invalidate`).send({ reason: REASON, secondReviewerId: users.proctor2 }).expect(200);
    await api('proctor2', 'post', `/asmt/integrity/${ids.manual}/second-review`).send({ confirm: false, reason: 'The frames do not show anyone else.' }).expect(200);
    expect((await api('proctor', 'get', `/asmt/integrity/${ids.manual}`).expect(200)).body).toMatchObject({ status: 'open', verdict: null, level: 'manual', secondReviewer: null });
  });

  // AS-5 part 2 (answers 2006, 2231): a proctor pauses and resumes from the live console, each with a reason the record
  // keeps; ending works on a paused attempt; the candidate cannot lift a proctor's pause.
  it('PRC-13: a proctor pauses with a reason and a message; the candidate sees the message and cannot resume it', async () => {
    const r = await running();
    await api('proctor', 'post', `/attempts/${r.attemptId}/pause`).send({ reason: 'short' }).expect(400);
    await api('reader', 'post', `/attempts/${r.attemptId}/pause`).send({ reason: REASON }).expect(403);
    await api('adminB', 'post', `/attempts/${r.attemptId}/pause`).send({ reason: REASON }).expect(404);
    expect((await api('proctor', 'post', `/attempts/${r.attemptId}/pause`).send({ reason: 'A second person came into the room.', message: 'Please ask the person behind you to leave.' }).expect(200)).body.status).toBe('paused');
    const cur = (await cand(r.ct, 'get', '/attempt/current').expect(200)).body;
    expect(cur).toMatchObject({ status: 'paused', pausedReason: 'proctor', pauseMessage: 'Please ask the person behind you to leave.' });
    await cand(r.ct, 'post', '/attempt/webcam-resume').send({}).expect(400);
    await api('proctor', 'post', `/attempts/${r.attemptId}/pause`).send({ reason: REASON }).expect(400);
    const ev = await inOrg(org.A.id, (tx) => tx.proctoringEvent.findFirstOrThrow({ where: { attemptId: r.attemptId, eventType: 'proctor_paused' } }));
    expect(JSON.parse(ev.metadataJson!)).toMatchObject({ reason: 'A second person came into the room.', by: users.proctor });
    expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { entityId: r.attemptId, action: 'attempt.paused' } }))).toBe(1);
    await api('proctor', 'post', `/attempts/${r.attemptId}/resume`).send({ reason: 'no' }).expect(400);
    expect((await api('proctor', 'post', `/attempts/${r.attemptId}/resume`).send({ reason: 'The person left; the room is clear.' }).expect(200)).body.status).toBe('in_progress');
    expect((await cand(r.ct, 'get', '/attempt/current').expect(200)).body).toMatchObject({ status: 'in_progress', pausedReason: null });
    // Ending a paused attempt: the second factor and a reason.
    await api('proctor', 'post', `/attempts/${r.attemptId}/pause`).send({ reason: REASON }).expect(200);
    const cold = await request(http).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `proctor-${run}@as5.test`, password: PASSWORD }).expect(200);
    await request(http).post(`/api/v1/attempts/${r.attemptId}/force-submit`).set('Authorization', `Bearer ${cold.body.accessToken}`).send({ reason: REASON }).expect(403);
    await markSteppedUp(tenantPrisma, token.proctor);
    expect((await api('proctor', 'post', `/attempts/${r.attemptId}/force-submit`).send({ reason: REASON }).expect(201)).body.status).toBeDefined();
    expect((await cand(r.ct, 'get', '/attempt/current').expect(200)).body.status).not.toBe('paused');
  });

  // Answer 2205: approving time above the cap on a face-checked test pauses it for a face check before it carries on.
  it('a face re-check pause: the candidate cannot wave it away; the check resumes it (or a proctor does)', async () => {
    const r = await running(true);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.attempt.update({ where: { id: r.attemptId }, data: { status: 'paused', pausedAt: new Date(), pausedReason: 'face_recheck' } }));
    await cand(r.ct, 'post', '/attempt/webcam-resume').send({}).expect(400);
    await cand(r.ct, 'post', '/attempt/face-recheck').send({ snapshot: 'data:image/jpeg;base64,' }).expect(400);
    // No enrolment photo (or no model): the check cannot run, so the candidate is never stuck: it resumes.
    const out = (await cand(r.ct, 'post', '/attempt/face-recheck').send({ snapshot: `data:image/jpeg;base64,${Buffer.from('not a real photo').toString('base64')}` }).expect(201)).body;
    expect(out).toMatchObject({ status: 'in_progress', matched: null });
    await cand(r.ct, 'post', '/attempt/face-recheck').send({ snapshot: `data:image/jpeg;base64,${Buffer.from('x').toString('base64')}` }).expect(400);
    // A proctor may lift a face re-check too.
    await tenantPrisma.forTenant(SUPER, (tx) => tx.attempt.update({ where: { id: r.attemptId }, data: { status: 'paused', pausedAt: new Date(), pausedReason: 'face_recheck' } }));
    expect((await api('proctor', 'post', `/attempts/${r.attemptId}/resume`).send({ reason: 'Checked the candidate on camera myself.' }).expect(200)).body.status).toBe('in_progress');
  });

  it('negative: approving time above the cap does not pause a test without face checks', async () => {
    const r = await running(false);
    const credit = await inOrg(org.A.id, (tx) => tx.connectivityCredit.create({ data: { attemptId: r.attemptId, lostMs: 120_000 } }));
    await api('adminA', 'post', `/asmt/connectivity/${credit.id}/approve`).send({ reason: 'Area-wide outage confirmed.' }).expect(200);
    expect((await cand(r.ct, 'get', '/attempt/current').expect(200)).body.status).toBe('in_progress');
  });

  it('approving time above the cap on a face-checked test with an enrolment photo pauses it for the face check', async () => {
    const r = await running(true);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.faceEnrolment.create({ data: { attemptId: r.attemptId, status: 'enrolled', embedding: 'sealed' } }));
    const credit = await inOrg(org.A.id, (tx) => tx.connectivityCredit.create({ data: { attemptId: r.attemptId, lostMs: 120_000 } }));
    await api('adminA', 'post', `/asmt/connectivity/${credit.id}/approve`).send({ reason: 'Area-wide outage confirmed.' }).expect(200);
    expect((await cand(r.ct, 'get', '/attempt/current').expect(200)).body).toMatchObject({ status: 'paused', pausedReason: 'face_recheck' });
  });

  // Answers 2265, 2266: a final "section not counted" voids that section's marks (the section still counts toward the
  // maximum); overturning it on appeal restores them; the candidate is emailed the decision and the appeal outcome.
  it('a section verdict voids its marks and emails the candidate; an overturn restores them', async () => {
    const r = await running();
    const right = await inOrg(org.A.id, (tx) => tx.questionOption.findFirstOrThrow({ where: { questionId: ids.q, isCorrect: true }, select: { id: true } }));
    await cand(r.ct, 'post', '/attempt/answer').send({ questionId: ids.q, selectedOptionIds: [right.id], clientSavedAt: new Date().toISOString() }).expect(201);
    await cand(r.ct, 'post', '/attempt/submit').send({}).expect(201);
    const before = await inOrg(org.A.id, (tx) => tx.result.findUniqueOrThrow({ where: { attemptId: r.attemptId } }));
    expect(before.score).toBe(10);
    await flag(r.attemptId, 'review');
    const inc = (await inOrg(org.A.id, (tx) => tx.integrityIncident.findUniqueOrThrow({ where: { attemptId: r.attemptId } }))).id;
    sent.length = 0;
    await api('proctor', 'post', `/asmt/integrity/${inc}/verdict`).send({ verdict: 'section', sectionTitle: 'Java', reason: 'Code 91 % similar to another candidate in this test.' }).expect(200);
    const voided = await inOrg(org.A.id, (tx) => tx.result.findUniqueOrThrow({ where: { attemptId: r.attemptId } }));
    expect([voided.score, voided.maxScore, voided.percentage, voided.passFail]).toEqual([0, 10, 0, 'fail']);
    expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { entityId: r.attemptId, action: 'result.rescored_for_integrity' } }))).toBe(1);
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining('A decision about your test')]);
    await cand(r.ct, 'post', '/attempt/appeal').send({ text: 'I wrote this code myself in my college project.' }).expect(201);
    const appeal = (await inOrg(org.A.id, (tx) => tx.integrityAppeal.findFirstOrThrow({ where: { attemptId: r.attemptId } }))).id;
    await markSteppedUp(tenantPrisma, token.evaluator);
    sent.length = 0;
    await api('evaluator', 'post', `/asmt/appeals/${appeal}/overturn`).send({ reason: 'The git history shows the code was written in March.' }).expect(200);
    const restored = await inOrg(org.A.id, (tx) => tx.result.findUniqueOrThrow({ where: { attemptId: r.attemptId } }));
    expect([restored.score, restored.percentage]).toEqual([10, before.percentage]);
    expect(sent.map((m) => m.subject)).toEqual([expect.stringContaining('Your appeal')]);
  });

  it('negative: a cleared verdict sends no email and changes no score; an opted-out candidate gets no email', async () => {
    const r = await submitted();
    await flag(r.attemptId, 'review');
    const inc = (await inOrg(org.A.id, (tx) => tx.integrityIncident.findUniqueOrThrow({ where: { attemptId: r.attemptId } }))).id;
    sent.length = 0;
    await api('proctor', 'post', `/asmt/integrity/${inc}/verdict`).send({ verdict: 'cleared', reason: 'Looked at every frame; nothing wrong.' }).expect(200);
    expect(sent).toEqual([]);
    expect(await inOrg(org.A.id, (tx) => tx.auditLog.count({ where: { entityId: r.attemptId, action: 'result.rescored_for_integrity' } }))).toBe(0);
    const o = await submitted();
    const candId = (await inOrg(org.A.id, (tx) => tx.attempt.findUniqueOrThrow({ where: { id: o.attemptId }, select: { candidateId: true } }))).candidateId;
    await inOrg(org.A.id, (tx) => tx.candidate.update({ where: { id: candId }, data: { emailOptedOutAt: new Date() } }));
    await flag(o.attemptId, 'review');
    const oi = (await inOrg(org.A.id, (tx) => tx.integrityIncident.findUniqueOrThrow({ where: { attemptId: o.attemptId } }))).id;
    sent.length = 0;
    await api('proctor', 'post', `/asmt/integrity/${oi}/verdict`).send({ verdict: 'warning', reason: 'A second voice was heard twice.' }).expect(200);
    expect(sent).toEqual([]);
  });
});
