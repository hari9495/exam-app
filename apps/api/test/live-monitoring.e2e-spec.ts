import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Live Monitoring WebSocket flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let runtimePort: number;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp, port: runtimePort } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-monitoring-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Monitoring Org', slug: `ci-monitoring-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-monitoring.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-monitoring.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Live Monitoring Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this a live monitoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    return inviteResponse.body.created[0].token;
  }

  function connectRecruiterSocket(token: string = recruiterAccessToken): Socket {
    return io(`http://localhost:${runtimePort}/monitoring`, { auth: { token }, transports: ['websocket'], forceNew: true });
  }

  function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  it('sends a roster snapshot on join, then pushes attempt:status and proctoring:flag as they happen', async () => {
    const token = await inviteAndGetToken('alice@ci-monitoring.test', 'Alice');
    const socket = connectRecruiterSocket();

    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    const snapshot = await waitForEvent<any[]>(socket, 'roster:snapshot');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ candidateName: 'Alice', status: 'invited', online: false });

    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    const attemptStatusPromise = waitForEvent<any>(socket, 'attempt:status');
    const startResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ consent: true })
      .expect(201);
    const attemptStatus = await attemptStatusPromise;
    expect(attemptStatus).toEqual({ attemptId: startResponse.body.id, candidateId: expect.any(String), status: 'in_progress' });

    const proctoringFlagPromise = waitForEvent<any>(socket, 'proctoring:flag');
    await request(runtimeHttp)
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);
    const proctoringFlag = await proctoringFlagPromise;
    expect(proctoringFlag).toEqual({ attemptId: startResponse.body.id, candidateId: expect.any(String), eventType: 'tab_switch', severity: 'medium', occurredAt: expect.any(String) });

    socket.disconnect();
  });

  it('delivers a recruiter message to the candidate on their next poll, and notifies the room', async () => {
    const token = await inviteAndGetToken('bob@ci-monitoring.test', 'Bob');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({ consent: true }).expect(201)).body.id;

    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    await waitForEvent(socket, 'roster:snapshot');

    const messageSentPromise = waitForEvent<any>(socket, 'message:sent');
    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/message`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ body: 'Please stay on the exam tab' })
      .expect(201);
    await messageSentPromise;

    const currentResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(currentResponse.body.messages).toHaveLength(1);
    expect(currentResponse.body.messages[0].body).toBe('Please stay on the exam tab');

    const secondCurrentResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(secondCurrentResponse.body.messages).toHaveLength(0);

    socket.disconnect();
  });

  it('force-submits an attempt, pushing attempt:status to the room exactly once', async () => {
    const token = await inviteAndGetToken('carol@ci-monitoring.test', 'Carol');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({ consent: true }).expect(201)).body.id;

    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    await waitForEvent(socket, 'roster:snapshot');

    // Collect every attempt:status event (rather than resolving on the first with .once()) so
    // we can assert there is exactly one — a regression guard against force-submit emitting the
    // event itself in addition to the emit already performed inside AttemptSettlementService.finalize().
    const attemptStatusEvents: any[] = [];
    socket.on('attempt:status', (payload) => attemptStatusEvents.push(payload));

    await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    // Round-trip another HTTP call through the same server/socket stack so any second,
    // asynchronously-delivered copy of the event would have had time to arrive before we assert.
    await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/messages`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    expect(attemptStatusEvents).toHaveLength(1);
    expect(attemptStatusEvents[0]).toEqual({ attemptId, candidateId: expect.any(String), status: 'force_submitted' });

    socket.disconnect();
  });

  it('rejects a socket connection with no token, and rejects joining an exam outside the caller organization', async () => {
    const unauthenticated = io(`http://localhost:${runtimePort}/monitoring`, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((resolve) => unauthenticated.on('disconnect', () => resolve()));

    const otherOrgHash = await argon2.hash('OtherOrgPassw0rd!');
    const otherPlan = await prisma.plan.create({
      data: { name: `ci-monitoring-other-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    const otherOrg = await prisma.organization.create({ data: { name: 'CI Monitoring Other Org', slug: `ci-monitoring-other-org-${randomUUID()}`, planId: otherPlan.id } });
    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: otherOrg.id, email: 'other@ci-monitoring.test', passwordHash: otherOrgHash, role: 'recruiter' } }),
    );
    const otherAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: otherOrg.slug, email: 'other@ci-monitoring.test', password: 'OtherOrgPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const otherSocket = connectRecruiterSocket(otherAccessToken);
    await waitForEvent(otherSocket, 'connect');
    const errorPromise = waitForEvent<any>(otherSocket, 'error');
    otherSocket.emit('join-exam', { examId });
    const error = await errorPromise;
    expect(error.message).toBe(`Exam ${examId} not found`);
    otherSocket.disconnect();

    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: otherOrg.id } } }));
    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: otherOrg.id } }));
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: otherPlan.id } }).catch(() => undefined);
  });

  it('pushes a leaderboard:update after a candidate answers an auto-gradable question correctly', async () => {
    const token = await inviteAndGetToken('dana@ci-monitoring.test', 'Dana');
    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    // The exam is shared across every `it` block in this file (see `beforeAll`), and earlier
    // tests (Alice, Bob, Carol) already started attempts on it — so the snapshot isn't empty by
    // the time this test runs. Assert against Dana's absence/presence rather than exact equality.
    const snapshot = await waitForEvent<any[]>(socket, 'leaderboard:snapshot');
    expect(snapshot.find((entry: any) => entry.candidateName === 'Dana')).toBeUndefined();

    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({ consent: true }).expect(201);

    const current = await request(runtimeHttp).get('/api/v1/attempt/current').set('Authorization', `Bearer ${accessToken}`).expect(200);
    const questionId = current.body.sections[0].questions[0].id;
    // The `beforeAll` above seeds this true_false question with options [{ text: 'True', isCorrect: true },
    // { text: 'False', isCorrect: false }] (see the `POST /api/v1/questions` call), so 'True' is the real
    // correct option — no fallback needed, and correctCount below can be asserted exactly.
    const correctOptionId = current.body.sections[0].questions[0].options.find((option: any) => option.text === 'True').id;

    const leaderboardUpdatePromise = waitForEvent<any>(socket, 'leaderboard:update');
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);
    const update = await leaderboardUpdatePromise;

    expect(update).toHaveLength(snapshot.length + 1);
    const danaEntry = update.find((entry: any) => entry.candidateName === 'Dana');
    expect(danaEntry).toMatchObject({ candidateName: 'Dana', correctCount: 1 });

    const candidateView = await request(runtimeHttp).get('/api/v1/attempt/leaderboard').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(candidateView.body.you).not.toBeNull();
    expect(candidateView.body.top[0]).toMatchObject({ isYou: true, label: 'You' });

    socket.disconnect();
  });
});
